# Réglages worktree par repo — Phase 1

**Date** : 2026-07-13
**Statut** : Design validé, prêt pour le plan d'implémentation
**Portée** : Phase 1 (réglages). La Phase 2 (écran de progression de création + vrai run Claude qui lit l'issue + exécution files-to-copy/setup) fera l'objet d'un spec séparé.

## Contexte & objectif

Chaque repo configuré dans Settings doit avoir **ses propres réglages worktree**, éditables depuis une page dédiée ouverte via un bouton **⚙️** dans la sidebar (à côté du **+** « lancer un agent »).

Réglages (inspirés de Conductor, « Conductor » → « Devora ») :
- **Create PR prompt** — aujourd'hui global (`app_settings` clé `create_pr_prompt`), **déplacé par repo**.
- **Files to copy** — fichiers auto-copiés dans chaque nouveau worktree.
- **Setup script** — commande(s) au lancement d'un worktree.
- **Archive script** — commande(s) avant archivage.
- **Run scripts** — raccourcis nommés (dev server, tests…) `{id, name, command}`, avec Add/Edit/Delete.

**Frontière Phase 1 / Phase 2** :
- **Phase 1 (ce spec)** : stockage + page de réglages + déplacement du Create PR prompt + **exécution des run-scripts** (boutons dans le Workbench → ShellTerminal).
- **Phase 2 (plus tard)** : écran de progression de création (loaders par étape) qui **exécute** `files_to_copy` + `setup_script` (+ étape « agent lit l'issue »), et l'exécution du `archive_script`. Phase 1 ne fait que **stocker** ces trois-là.

## Décisions validées

1. **Stockage** : table SQLite `repoSettings` keyée par `repo_full_name`. Le `.devora/settings.toml` est une **mention UI** (partage équipe), non implémenté v1.
2. **Run scripts** : boutons dans le Workbench → commande injectée dans le **ShellTerminal** de la session.
3. **Files to copy** (config seulement en Phase 1) : sémantique « remplace `.env*`, fallback `.env*` si vide » — appliquée en Phase 2.

## Architecture

### 1. Schéma / migration — `src/db/schema.ts` + `src/db/migrations/`

Nouvelle table `repoSettings` :
```ts
export const repoSettings = sqliteTable('repo_settings', {
	id: uuid(),
	repo_full_name: text().notNull().unique(),
	create_pr_prompt: text().default(''),
	files_to_copy: text().default(''),        // une ligne par chemin
	setup_script: text().default(''),
	archive_script: text().default(''),
	run_scripts: text({ mode: 'json' }).$type<RunScript[]>().default([]),
	updated_at: timestamp(),
});
```
`RunScript = { id: string; name: string; command: string }`. Migration **additive** via `npx drizzle-kit generate` (sort dans `src/db/migrations/`).

### 2. API — `src/app/api/repo-settings/route.ts`

Calquée sur `/api/settings` (auth via `requireAuth`) :
- **GET `/api/repo-settings?repo=<owner/repo>`** → la ligne (ou défauts si absente).
- **PUT `/api/repo-settings`** `{ repo_full_name, create_pr_prompt, files_to_copy, setup_script, archive_script, run_scripts }` → upsert `onConflictDoUpdate` sur `repo_full_name` (full-row set + `updated_at`).

### 3. Hook — `src/hooks/useRepoSettings.ts`

`useRepoSettings(repoFullName: string | null)` (React Query, `queryKey: ['repo-settings', repoFullName]`, `enabled: !!repoFullName`) :
- `settings: RepoSettings` (défauts si absent : chaînes vides + `run_scripts: []`).
- `save(partial)` → merge + PUT + optimistic `setQueryData`.
- `isLoading`, `isSaving`.
Type `RepoSettings` ajouté à `src/types/index.ts`.

### 4. Page — `src/app/(app)/settings/repo/[...repo]/page.tsx` + `RepoSettingsPanel`

- **Route catch-all `[...repo]`** (et non `[owner]/[repo]`) : `repo_full_name` n'est pas toujours `owner/repo` — pour un repo ajouté manuellement dont le remote git n'a pas pu être résolu, c'est un simple nom de dossier **sans `/`** (cf. `useAgentViews.repoFullName` ← `repo_paths.repo_full_name`). Le catch-all capture 1 **ou** 2+ segments et les rejoint.
- `page.tsx` (server) : `const repoFullName = (await params).repo.join('/');` puis rend `<RepoSettingsPanel repoFullName={repoFullName} />` (client). Next.js décode déjà chaque segment catch-all — pas de `decodeURIComponent` supplémentaire. Fonctionne pour `owner/repo` (2 segments) comme `myrepo` (1 segment).
- **`src/components/settings/RepoSettingsPanel.tsx`** — sections (design soigné, cohérent avec `SettingsPanel`) :
  - **Create PR prompt** : textarea + save. Placeholder = `DEFAULT_CREATE_PR_PROMPT`.
  - **Files to copy** : textarea (une ligne par chemin) + description « Devora copiera automatiquement ces fichiers dans chaque nouveau worktree. »
  - **Scripts** : *Setup script* (textarea, « Tourne quand un worktree est créé ») + *Archive script* (textarea, « Tourne avant l'archivage d'un worktree »).
  - **Run scripts** : liste `{name, command}` éditable (Add/Edit/Delete inline). « Raccourcis pour lancer ton dev server, tes tests, etc. »
  - Note bas de page (texte seul) : « Partager avec ton équipe ? Crée un fichier `.devora/settings.toml`. »
- Sauvegarde : par section (bouton Save) ou debounce — suivre le pattern `SettingsPanel` (bouton Save par bloc). i18n `repoSettings.*` (5 locales).

### 5. Sidebar — `src/components/layout/Sidebar.tsx`

À côté du **+** de chaque repo (bloc `IconButton` `launchAgent` ~ligne 312-326), ajouter un **`IconButton` ⚙️** (`SettingsRoundedIcon`) → `router.push('/settings/repo/' + view.repoFullName.split('/').map(encodeURIComponent).join('/'))`. La route étant catch-all (§4), un `repoFullName` avec ou sans `/` fonctionne — inutile de masquer le bouton. `router` déjà présent dans le Sidebar.

### 6. Create PR prompt déplacé — `SettingsPanel` + `AgentChatTab` + `Workbench`

- **`SettingsPanel.tsx`** : retirer la section Create PR prompt (le bloc `useAppSetting(CREATE_PR_PROMPT_KEY)` + son UI).
- **`Workbench.tsx`** : résoudre le `repoFullName` de la session — priorité `issue_owner/issue_repo` (`${owner}/${repo}`), sinon reverse-lookup `repoPaths` par `resolved.project_path`, **match insensible à la casse** (`rp.local_path.toLowerCase() === project_path.toLowerCase()`) pour éviter un échec silencieux sur APFS. `useRepoSettings(repoFullName)` → passer **`createPrPrompt`** en prop à `AgentChatTab` (fallback `DEFAULT_CREATE_PR_PROMPT`).
- **`AgentChatTab.tsx`** : accepter une prop `createPrPrompt?: string` ; remplacer le `useAppSetting(CREATE_PR_PROMPT_KEY)` par cette prop (fallback `DEFAULT_CREATE_PR_PROMPT`). Le bouton « Create PR » envoie `createPrPrompt`.
- `CREATE_PR_PROMPT_KEY` / `DEFAULT_CREATE_PR_PROMPT` (`src/lib/prompts.ts`) : `DEFAULT_CREATE_PR_PROMPT` conservé (fallback) ; `CREATE_PR_PROMPT_KEY` (app_settings) devient inutilisé → retirer ses usages (la clé en base est simplement abandonnée, pas de migration).

### 7. Run scripts exécutés — `Workbench` + `ShellTerminal`

- **`ShellTerminal.tsx`** : exposer un handle impératif `runCommand(cmd: string)` (via `forwardRef` + `useImperativeHandle`) qui écrit `cmd + "\r"` dans le WS si connecté. (Le shell reste tel quel sinon.)
- **`Workbench.tsx`** : au-dessus / à côté du panneau Terminal (sidebar droite), une rangée de **chips/boutons** (un par `run_scripts` du repo). Clic → `shellRef.current?.runCommand(script.command)`. Le Terminal étant toujours visible (empilé), l'output apparaît directement. Si aucun run-script → pas de rangée.
- Résolution repo identique au §6.

## Types (`src/types/index.ts`)

```ts
export interface RunScript { id: string; name: string; command: string; }
export interface RepoSettings {
	repo_full_name: string;
	create_pr_prompt: string;
	files_to_copy: string;
	setup_script: string;
	archive_script: string;
	run_scripts: RunScript[];
}
```

## i18n

Namespace `repoSettings` (5 locales) : titres/descriptions des sections, labels Add/Edit/Delete/Save, placeholders, note `.devora/settings.toml`. Sidebar : réutiliser un label existant ou ajouter `sidebar.repoSettings` (« Réglages du repo »). Pas de texte en dur.

## Hors scope Phase 1 (→ Phase 2)

- Écran de progression de création (loaders par étape).
- Exécution de `files_to_copy` + `setup_script` à la création du worktree (`packages/agent/src/routes/git.ts`).
- Exécution du `archive_script` avant archivage.
- Étape « agent lit l'issue » (vrai run Claude background).
- `.devora/settings.toml` (lecture/écriture fichier) — mention UI seulement.

## Risques / points à vérifier pendant le plan

1. **Résolution `repoFullName` d'une session** : couvrir les 2 cas (issue → `issue_owner/issue_repo` ; sinon reverse-lookup `repoPaths` par `project_path`), **match insensible à la casse d'entrée** (obligatoire, pas « si pertinent »). ⚠️ `project_path` est **nullable** (schema) et `resolved` peut être null → guarder avant `.toLowerCase()`. Si non résolu → fallback `DEFAULT_CREATE_PR_PROMPT` et pas de run-scripts.
2. **`ShellTerminal.runCommand`** : le composant passe en `forwardRef` ; vérifier que ses conscommateurs actuels (Workbench) ne cassent pas (ref optionnel). Envoi `cmd + "\r"` seulement si `ws.readyState === OPEN`.
3. **Route catch-all `[...repo]`** : `await params`, join des segments ; Next décode déjà chaque segment. Le group `(app)` protège déjà via AppShell.
4. **`useAgentViews.repoFullName`** peut être un simple nom de dossier sans `/` (repo ajouté manuellement, remote git non résolu). Résolu par la **route catch-all `[...repo]`** (§4) : pas besoin de masquer le ⚙️. `repo_settings` est keyé par ce `repo_full_name` tel quel (cohérent entre sidebar, page et Workbench, tous issus de `repo_paths`).
5. **Retrait Create PR global** : vérifier qu'aucun autre consommateur de `CREATE_PR_PROMPT_KEY` ne subsiste (grep) avant de retirer l'UI globale.
6. **run_scripts JSON** : typer `text({ mode: 'json' })` et gérer la génération d'`id` (crypto.randomUUID côté client à l'ajout).
