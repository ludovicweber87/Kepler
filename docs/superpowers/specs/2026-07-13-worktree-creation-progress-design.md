# Écran de progression de création de worktree — Phase 2

**Date** : 2026-07-13
**Statut** : Design validé, prêt pour le plan
**Dépend de** : Phase 1 (table `repo_settings` : `files_to_copy`, `setup_script`, `archive_script` ; helper `resolveRepoFullName` ; hook `useRepoSettings`).

## Contexte & objectif

À la création d'une session (nouveau worktree), afficher un **écran de progression centré** sur la page Workbench : une **liste à puces** avec un **loader → ✓** (ou ✗) par étape. Étapes (séquentielles) :
1. **(si lancé depuis une issue)** un **vrai run Claude en background** lit l'issue et son résumé est **injecté (invisible) dans le `system_prompt`** de la session.
2. **Création du worktree**.
3. **Copie des `files_to_copy`**.
4. **Exécution du `setup_script`**.
5. **Prêt** → bascule sur la conversation.

En complément : exécuter le **`archive_script`** avant l'archivage d'une session.

## Décisions validées

1. **Orchestration** : le **serveur agent streame la progression en SSE** (un endpoint unique). Le Workbench affiche les puces au fil des events.
2. **Sortie du run issue-read** : **injectée en contexte** (append au `system_prompt`, invisible dans le thread).
3. **Statut `provisioning`** sur la session (Workbench le détecte → écran de progression ; l'agent le passe à `active`/`error`).
4. **Séquentiel** : read-issue → worktree → copy → setup.
5. **Erreur par étape** : puce ✗ + message + bouton **Réessayer**.

## Architecture

### 1. Statut `provisioning` — `src/hooks/useAgentSession.ts` + `src/lib/sessionStatus.ts`

- `AgentSession.status` : ajouter `'provisioning'` à l'union (`'active' | 'completed' | 'error' | 'provisioning'`). Pas de migration (colonne `text`).
- `classifySession` : `provisioning` ne doit PAS être traité comme `past`. Le Workbench court-circuite sur `provisioning` **avant** d'appeler `classifySession` (cf. §3), donc `classifySession` peut mapper `provisioning` → `active`-like ou rester inchangé ; à trancher au plan (le plus sûr : le Workbench teste `status === 'provisioning'` en premier ; vérifier qu'aucun autre consommateur de `classifySession` ne casse sur un statut inconnu — il renvoie déjà `past` pour tout non-`active`, ce qui est inoffensif tant que le Workbench court-circuite).

### 2. Endpoint agent SSE — `POST /git/provision` (`packages/agent/src/routes/git.ts`, dispatché par `handleGitRoutes`)

Body : `{ cwd, branch, sessionId, mode: 'worktree' | 'current-branch', issue?: { owner, repo, number }, filesToCopy: string, setupScript: string }`.
Utilise `startSSE`/`sendSSE` (helpers existants). Émet des events `{ step, status: 'running' | 'done' | 'error', message? }` puis un event final. Séquence :

1. **read-issue** (si `issue`) : `gh issue view <number> --repo <owner>/<repo> --comments` → `claude --print` (résumé/analyse) → **append** le résumé au `system_prompt` de la session en DB (`getDb`, UPDATE `agent_sessions`). Events running→done.
2. **worktree** (si `mode==='worktree'`) : `git worktree add …` (logique déplacée depuis le POST `/git/worktrees` actuel). En cas de retry, si le worktree existe déjà → considérer done (idempotent).
3. **copy-files** (si `mode==='worktree'`) : copie `filesToCopy` (une ligne par chemin ; fallback `.env*` si vide) + symlink `node_modules`.
4. **setup** (si `mode==='worktree'` et `setupScript` non vide) : exécute `setupScript` dans le worktree (timeout large). Erreur → event error, mais worktree déjà créé (voir §Erreurs).
5. **done** : event final `{ step:'done', worktreePath }`. L'agent met la session en DB : `status='active'`, `worktree_path=<path>`.

Erreur à une étape → event `{ step, status:'error', message }` + session `status='error'`. (Le worktree partiellement créé reste ; Réessayer reprend, idempotent.)

Pour `mode==='current-branch'` : pas de worktree/copy/setup ; seulement read-issue (si issue) puis `status='active'` (cwd = repo root).

### 3. Lancement — `AgentTerminalModal.tsx` (ne bloque plus, ne crée plus le worktree)

Les 3 chemins de lancement (`handleLaunch` worktree, `handleLaunchCurrentBranch`, effet `existingWorktree`) :
- **Ne créent plus le worktree** (retrait de `createWorktree` du modal).
- `ensureSession` avec **`status:'provisioning'`** (+ branch, issue fields, `system_prompt` de base, projectPath, `worktree_path: null`), puis `goToWorkbench(sessionId)` immédiatement.
- Cas **`existingWorktree`** (worktree déjà présent, BranchDetail) : pas de provisioning worktree → `status:'active'` directement + `worktree_path` fourni (comportement actuel conservé, pas d'écran de progression).

### 4. Workbench — écran de progression — `Workbench.tsx` + `CreationProgress.tsx`

- Si `resolved.status === 'provisioning'` → rendre **`<CreationProgress session={resolved} repoSettings={repoSettings} />`** au lieu de la conversation.
- **`src/components/workbench/CreationProgress.tsx`** (`"use client"`) : **liste à puces centrée**, jolie (Framer Motion), une puce par étape (label i18n) avec état loader / ✓ / ✗. Ouvre le stream `POST /git/provision` (fetch + `ReadableStream`, parsing SSE comme le fait le client pour `/chat`) via `getAgentUrl()`, en passant `filesToCopy`/`setupScript` (de `repoSettings`), `cwd` (project_path), `branch`, `mode`, `issue` (depuis les issue fields de la session).
- Les steps affichés dépendent du `mode` (current-branch → juste read-issue).
- Sur event `done` → `queryClient.invalidateQueries(['agent-session', sessionId])` → la session repasse `active` → le Workbench bascule sur la conversation (avec `system_prompt` enrichi).
- Sur event `error` → puce ✗ + message + bouton **Réessayer** (relance le stream). 
- **Anti-double-provision** : garder un ref « démarré » pour ne pas relancer le stream à chaque re-render/remount tant que le statut est `provisioning` (sauf action Réessayer explicite).

### 5. Archive script — `Sidebar.tsx` (handleArchive) + agent `POST /git/run-script`

- Nouvel endpoint agent `POST /git/run-script` : `{ cwd, script }` → exécute `script` dans `cwd` (worktree), retourne succès/erreur (pas besoin de SSE ici — court, ou SSE optionnel).
- `handleArchive` (sidebar) : résoudre `repo_settings.archive_script` du repo de la session ; s'il est non vide → appeler `/git/run-script` avec le worktree path **avant** `archive(sessionId)`. Non bloquant si échec (snackbar warning), puis archiver.

### 6. Résolution des settings

Le Workbench (provision) et le Sidebar (archive) résolvent le repo via `resolveRepoFullName` (Phase 1) → `useRepoSettings` → `files_to_copy`/`setup_script`/`archive_script`, passés aux endpoints agent (agent stateless côté settings).

## i18n

Namespace `creationProgress` (5 locales) : labels des étapes (`readIssue`, `worktree`, `copyFiles`, `setup`, `ready`), titre, `retry`, messages d'erreur génériques. Pas de texte en dur.

## Hors scope (YAGNI)

- Streaming de l'output live du `setup_script`/read-issue dans l'écran (on montre juste running/done ; l'output détaillé va dans le ShellTerminal/logs si besoin plus tard).
- Parallélisation des étapes (séquentiel voulu).
- Le run issue-read écrit dans le thread (décision = injection invisible).

## Risques / points à vérifier pendant le plan

1. **SSE-over-fetch côté client** : `EventSource` ne supporte pas POST+body → utiliser `fetch` + `ReadableStream` + parsing des lignes `data:` (modéliser sur le client `/chat`). Gérer la fermeture/abort au démontage.
2. **Statut `provisioning` vs `classifySession`** : le Workbench doit court-circuiter AVANT `classifySession` ; vérifier les autres consommateurs (`useSessionManager`, RightSidebar/Sidebar buckets, dashboard) — une session `provisioning` tomberait en `past` : acceptable (elle n'apparaît pas encore en « active ») mais à confirmer qu'elle ne pollue pas une liste.
3. **Anti-double-provision** : le Workbench peut remonter (navigation, refetch) → ne pas lancer 2 streams concurrents ; idempotence de `git worktree add` (retry après échec partiel).
4. **`gh` + `claude` sur l'agent** : le read-issue dépend de `gh issue view` (token via env/gh) et `claude --print` (déjà utilisé par `generate-branch-name`). Fallback si `gh` échoue : sauter l'étape read-issue proprement (ne pas bloquer la création).
5. **`existingWorktree`/current-branch** : ne pas déclencher les étapes worktree/copy/setup ; provisioning réduit (ou absent pour existingWorktree).
6. **Persistance `system_prompt`** : l'agent append le résumé — s'assurer que le Workbench relit la session (invalidation) pour passer le `system_prompt` enrichi à `AgentChatTab` au 1er `stream-init`.
7. **Retrait de `createWorktree` du modal** : vérifier que plus rien d'autre ne dépend du worktree créé synchroniquement avant navigation (le shell/diff/chat du Workbench doivent attendre `status==='active'`).
8. **Timeout `setup_script`** : `pnpm install` peut être long → timeout large côté agent, et l'UI reste en loader.
