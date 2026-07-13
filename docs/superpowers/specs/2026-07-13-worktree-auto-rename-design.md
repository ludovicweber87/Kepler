# Auto-rename worktree (branche + dossier) au 1er prompt

**Date** : 2026-07-13
**Statut** : Design validé
**Approche retenue** : B — réparer et étendre le flux de rename post-prompt, côté serveur agent.

## Problème

Quand une session agent est lancée en mode « libre » (sans nom explicite), le worktree
reçoit un nom auto-généré `wip-<mots-aléatoires>` (branche **et** dossier
`.worktrees/wip-xxx`). L'intention documentée était de le renommer ensuite à partir du
premier prompt de l'utilisateur (convention Karma, kebab-case). Trois défauts constatés :

1. **Le rename ne se déclenche pas.** `src/lib/autoRenameBranch.ts` appelle `claude --print`
   via `execSync` **sans nettoyer l'environnement** (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`),
   contrairement à `packages/agent/src/routes/git.ts` (`generate-branch-name`) qui les strippe.
   Quand le serveur Next tourne dans une session Claude Code, `claude --print` échoue → `catch`
   silencieux → le nom `wip-` reste.
2. **Le dossier n'est pas renommé.** Le code actuel fait `git branch -m` (branche seulement) ;
   le dossier `.worktrees/wip-xxx` reste. Choix délibéré aujourd'hui car déplacer le dossier en
   cours de session casse le `cwd` de l'agent SDK et le tmux attaché.
3. **La sidebar affiche le mauvais nom.** `displayName = agent_name ?? wt.branch` : dès qu'un
   `agent_name` existe (persona, `#issue`, ou log `title`), il masque le nom Karma de la branche.

## Objectif

Au **premier** message utilisateur d'une session encore auto-nommée (`wip-`), renommer
**la branche ET le dossier** du worktree selon une convention Karma kebab-case
(`feat-...`, `fix-...`, `refactor-...`, etc.) dérivée du prompt, et refléter ce nom dans la
sidebar — de façon fiable et sans casser la session en cours.

## Contraintes découvertes

- La session SDK (`packages/agent/src/sdk/sdkAgent.ts`) fige son `cwd` dans l'appel `query()`
  (`options.cwd = params.cwd`) à `startOrAttach`. On **ne peut pas** re-pointer le `cwd` sans
  recréer la query. `sdkAgent` expose `stop(sessionId)` (ferme la queue, retire de la map).
- Le sous-processus `claude` de la session SDK et le tmux ont leur `cwd` sur le dossier du
  worktree ; déplacer le dossier sous eux invalide leur `cwd`.
- `git worktree list --porcelain` (utilisé par la sidebar) reflète le path **et** la branche
  réels après un `git worktree move` + `git branch -m`.
- La sidebar mappe les sessions par `wt.path` (`sessionByWorktree.get(wt.path)`) → après un
  move, `wt.path` et `agent_sessions.worktree_path` doivent être mis à jour de façon cohérente.
- `sdkAgent` nettoie déjà l'env (`cleanEnv()` supprime `CLAUDECODE`, etc.) — le bug d'env est
  isolé à `src/lib/autoRenameBranch.ts`.
- Point d'entrée du 1er message côté agent : `terminal.ts`, handler `stream-user-message`
  (`sdkAgent.sendUserMessage`).

## Design

### Principe & localisation

Toute la logique de rename migre **côté serveur agent** (`packages/agent`), seul process qui
possède la session SDK, le tmux et les opérations git. Bénéfices :

- Une **seule source de vérité** (plus de double déclencheur Next → plus de race).
- Env déjà maîtrisé côté agent.
- Le teardown/rebuild SDK et le tmux sont pilotés localement, de façon atomique.

### Déclencheur

Dans `terminal.ts`, handler `stream-user-message` : à réception d'un message, si c'est le
**premier** message de la session **et** que la session est encore `wip-`, exécuter la
séquence de rename **avant** de pousser le prompt à la queue SDK. Sinon, comportement inchangé.

Détection « premier message » : la session est encore `wip-` ET aucun message user n'a encore
été traité. Un flag `renaming` par sessionId (Set) sérialise les cas de double envoi rapide.

### Séquence atomique — nouveau module `packages/agent/src/sdk/renameWorktree.ts`

Fonction `renameWorktreeFromPrompt(sessionId, text) : Promise<RenameResult | null>` :

1. Lire la session en DB (`getDb()`) : `branch`, `worktree_path`, `project_path`. Guard :
   `branch?.startsWith('wip-')` et `worktree_path` présent, sinon retourner `null` (skip).
2. Générer le nom Karma : `claude --print` avec **env nettoyé**
   (`const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env`), prompt Karma
   (types : `feat|fix|docs|refactor|test|chore|perf`), timeout ~30 s. Normaliser via
   `toKarmaKebab()` (repris de `autoRenameBranch.ts`). Échec/vide/identique → retourner `null`
   (dégradation gracieuse : garder `wip-`).
3. Calculer `newPath = <repoRoot>/.worktrees/<karma>` (repoRoot = parent de `.worktrees`).
   Si le dossier existe déjà → suffixer `-2`, `-3`, … (branche idem).
4. **Teardown** : `sdkAgent.stop(sessionId)` (aucun état utile perdu, 1er message pas encore
   traité) ; si un tmux `sessionId` existe, `tmux kill-session`.
5. `git worktree move <old> <new>` puis `git -C <new> branch -m <karma>`.
6. Update DB : `worktree_path = newPath`, `branch = karma` pour cette session.
7. Retourner `{ branch: karma, worktreePath: newPath, cwd: newPath }`.

En cas d'échec **après** teardown mais **avant** move réussi : tenter un rollback minimal
(le worktree n'a pas bougé → seule la session SDK a été stoppée). Dans tous les cas d'échec,
on recrée la session SDK sur l'ancien `cwd` et on pousse le prompt (jamais de perte du prompt).

### Orchestration dans `terminal.ts`

```
on 'stream-user-message':
  if isFirstMessage(sessionId) && sessionIsWip(sessionId):
    result = await renameWorktreeFromPrompt(sessionId, text)   // peut être null
    cwd = result?.cwd ?? oldCwd
    sdkAgent.startOrAttach(sessionId, ws, { cwd, ...initParams }) // recrée la query
    if result: broadcast({ type: 'stream-renamed', sessionId, branch, worktreePath, cwd })
    sdkAgent.sendUserMessage(sessionId, text)
  else:
    sdkAgent.sendUserMessage(sessionId, text)  // inchangé
```

Les `initParams` (model, effort, permissionMode, systemPrompt, resume `claudeSessionId`)
sont conservés depuis le `stream-init` de la session (déjà mémorisés par socket/handler).
Le resume de `claudeSessionId` est appliqué s'il existe (sinon nouvelle session SDK, sans
perte puisque aucun tour n'a eu lieu).

### Front-end

- **`useAgentChat`** : gérer l'event `stream-renamed` → mettre à jour l'état local (`cwd`) et
  invalider React Query : `['git-worktrees', projectPath]`, `['sessions', 'active']`,
  `['agent-sessions', ...]`. `Workbench` recalcule `effectivePath` depuis la session mise à jour.
- **Sidebar** (`Sidebar.tsx`, #3) : `displayName` = **`wt.branch`** (nom Karma) en priorité
  pour une entrée worktree. Le persona/`agent_name`, s'il existe, passe en `Tooltip` (non
  bloquant, décidé côté implémentation).
- **Nettoyage** : retirer `onFirstUserMessage`/`submitRenameFromPrompt` de `Workbench.tsx`,
  `maybeAutoRenameBranch` de `src/app/api/agent-sessions/log/route.ts`, et supprimer
  `src/lib/autoRenameBranch.ts` (la logique `toKarmaKebab` est déplacée côté agent).
  Le endpoint `/api/agent-sessions/rename-from-prompt` devient inutilisé → supprimé aussi.

### Types

Ajouter le type d'event `stream-renamed` dans les types partagés du stream
(`packages/agent/src/sdk/types` + côté front là où les `StreamEvent` sont typés), avec
`{ type: 'stream-renamed'; sessionId: string; branch: string; worktreePath: string; cwd: string }`.

## Cas limites

| Cas | Comportement |
| --- | --- |
| `claude --print` échoue/vide | Garder `wip-`, recréer SDK sur ancien cwd, pousser le prompt. |
| Dossier cible déjà existant | Suffixe `-2`, `-3`, … sur dossier + branche. |
| `git worktree move` échoue (dirty/lock) | Rollback : recréer SDK sur ancien cwd, garder `wip-`, pousser le prompt. |
| Terminal (tmux) déjà ouvert | tmux killé puis recréé au nouveau cwd à la prochaine attache (scrollback perdu, acceptable — rien lancé au 1er message). |
| Double « premier message » rapide | `Set` `renaming` sérialise ; le 2e envoi attend/estskip et pousse simplement le prompt. |
| Reconnexion WS pendant le rename | `stream-renamed` + invalidation resync le front. |
| Session non-`wip-` (issue, current-branch) | Skip total, flux inchangé. |

## Hors scope (YAGNI)

- Sessions lancées depuis une issue (`feat/NN-slug`, déjà nommées).
- Sessions sur la branche courante (pas de worktree).
- Rename manuel du worktree via l'UI.
- Renommage rétroactif des worktrees `wip-` existants.

## Fichiers impactés

**Serveur agent** (`packages/agent/src/`)
- `sdk/renameWorktree.ts` — **nouveau** (génération nom + move + branch -m + DB).
- `terminal.ts` — hook `stream-user-message` (détection 1er message + orchestration), broadcast `stream-renamed`.
- `sdk/sdkAgent.ts` — s'assurer que `stop()` + `startOrAttach()` permettent le cycle teardown/rebuild ; exposer helper si besoin.
- `sdk/types` (+ mapMessage si nécessaire) — event `stream-renamed`.

**App Next** (`src/`)
- `hooks/useAgentChat.ts` — gérer `stream-renamed` (état + invalidations).
- `components/workbench/Workbench.tsx` — retirer le déclencheur de rename côté front.
- `components/layout/Sidebar.tsx` — priorité `displayName` sur `wt.branch`.
- `app/api/agent-sessions/log/route.ts` — retirer `maybeAutoRenameBranch`.
- `lib/autoRenameBranch.ts` — **supprimé**.
- `app/api/agent-sessions/rename-from-prompt/route.ts` — **supprimé**.
- `types/index.ts` — type d'event `stream-renamed` si les `StreamEvent` y sont centralisés.

## Tests (convention repo : logique pure uniquement)

- `toKarmaKebab()` : normalisation (accents, espaces, slashes, longueur, min 3 car., troncature).
- Résolution de collision de nom (`-2`, `-3`).
- Calcul de `newPath` à partir de `worktree_path` (dérivation du repoRoot).
- (UI/agent vérifiés par `lint` + `tsc --noEmit` + `build` + run manuel.)
