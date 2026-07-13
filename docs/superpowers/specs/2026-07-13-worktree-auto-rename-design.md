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
- Les `initParams` (model/effort/permissionMode) **ne sont mémorisés nulle part** de façon
  restaurable : `stream-init` les passe à `startOrAttach` puis les oublie (seul `streamSessionId`
  est gardé), et le schéma `agent_sessions` n'a que `agent_name`, `claude_session_id`,
  `system_prompt`. Ils ne vivent qu'en mémoire dans `SessionState` → doivent être réutilisés
  in-memory (d'où `relocate`), pas reconstruits.
- `sdkAgent.stop()` **diffuse `stream-closed`** et fait `sessions.delete` → inadapté pour un
  simple changement de cwd (flash UI + perte des clients). D'où `relocate`.
- `useAgentChat` : l'effet WS dépend de `p.cwd` (ligne 123) et fait `setMessages([])` (ligne 53)
  → un changement de cwd reconnecte et vide le chat si non corrigé.
- Deux tmux par session : `<sessionId>` et `<sessionId>-shell` (cf. `git.ts` cleanup) — les deux
  portent le cwd du worktree.
- `sendUserMessage` fait `sessions.get(sessionId)` → **no-op silencieux** si la session est
  absente (fenêtre de recréation) → nécessité de bufferiser pendant le rename.
- `runLoop` (sdkAgent.ts 74-99) fait `sessions.delete(sessionId)` **inconditionnellement** dans son
  `finally` et diffuse `stream-closed` en sortie de boucle si `!s.closed` → toute recréation
  réutilisant le même objet/clé serait supprimée par l'ancien `runLoop` (→ garde-fou d'identité obligatoire).
- `AgentChatTab` passe `enabled: true` en dur ; `p.cwd` de `useAgentChat` résout **de façon async**
  (null → path) → l'effet WS doit se (re)lancer à l'**apparition** du cwd, pas à chaque changement de valeur.

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

### Pourquoi `relocate()` plutôt que `stop()` + `startOrAttach()`

Le premier draft prévoyait `stop()` puis `startOrAttach()`. La relecture a montré deux défauts :
`stop()` **diffuse `{type:'stream-closed'}`** (→ `useAgentChat` passe `status='closed'`, flash UI),
et les `initParams` (model/effort/permissionMode) **ne sont mémorisés nulle part** : `stream-init`
les passe directement à `startOrAttach` puis les oublie, et le schéma DB n'a **aucune** colonne
model/effort/permissionMode. Les recréer « from init » régresserait le modèle/mode choisis.

→ On introduit une méthode **`sdkAgent.relocate(sessionId, newCwd)`** qui recrée la `query()` au
nouveau `cwd` **en réutilisant l'état mémoire de la session** et **en conservant le même `Set`
de clients WS** (aucun `stream-closed`, aucune reconnexion front, aucun `setMessages([])`).

**Contrainte critique (relecture R1)** : `runLoop` (sdkAgent.ts 74-99) fait, dans son `finally`,
`sessions.delete(sessionId)` **inconditionnellement**, et diffuse `stream-closed` en sortie de
`for await` si `!s.closed` (ligne 92). Si `relocate` **réutilisait le même objet `s`** et la même
clé, l'ancien `runLoop` (dont la query vient d'être fermée) exécuterait son `finally` **après** la
reconstruction et **supprimerait la session reconstruite** (→ `sendUserMessage` no-op, prompt perdu)
tout en diffusant `stream-closed` (→ flash). C'est pourquoi `relocate` **crée un nouvel objet
SessionState** et **`runLoop` est gardé par un check d'identité**.

`relocate(sessionId, newCwd)` :
1. `s = sessions.get(sessionId)` ; si absent → `return false`.
2. Construire un **nouveau** `s2: SessionState` qui **réutilise par référence** : `s.clients`
   (même `Set` → aucune reconnexion), `s.claudeSessionId`, `s.model`, `s.effort`,
   `s.permissionMode`, `s.seq`, et `s.perms`. `systemPrompt` relu en DB (`agent_sessions.system_prompt`).
   `s2.cwd = newCwd`, nouvelle `queue`, nouvelle `query()` (`cwd=newCwd`, `resume=claudeSessionId`
   si présent, mêmes model/effort/permissionMode/systemPrompt).
3. `sessions.set(sessionId, s2)` **avant** de fermer l'ancienne query (l'identité en map est déjà `s2`).
4. Fermer l'ancienne query : `void s.q.return?.()` (best-effort, non awaité) + `s.queue.close()`.
   L'ancien `runLoop` sort alors de sa boucle.
5. `void runLoop(sessionId, s2)`. `return true`.

**Garde-fou dans `runLoop`** (modif sdkAgent.ts) : encadrer le broadcast `stream-closed` **et** le
`sessions.delete` par un check d'identité `sessions.get(sessionId) === s`. L'ancien `runLoop`, voyant
que la map pointe désormais sur `s2 ≠ s`, **ne diffuse pas `stream-closed`** et **ne supprime pas** la
session. (Alternative équivalente : un jeton `epoch` par session.) Ce garde-fou est **le cœur** de la
correction R1 et doit être implémenté avec `relocate`.

Note d'atomicité : `s.q.return?.()` n'attend pas la sortie effective du sous-process `claude`
(déjà le cas de `stop()`). Sur POSIX/macOS, `git worktree move` d'un dossier qui est le `cwd` d'un
process idle est autorisé ; le process est de toute façon remplacé. Acceptable et documenté.

### Séquence atomique — nouveau module `packages/agent/src/sdk/renameWorktree.ts`

Fonction `renameWorktreeFromPrompt(sessionId, text) : Promise<RenameResult | null>` (effets de bord :
git + DB uniquement ; la recréation SDK est faite par l'appelant via `relocate`) :

1. Lire la session en DB (`getDb()`) : `branch`, `worktree_path`, `project_path`. Guard :
   `branch?.startsWith('wip-')` et `worktree_path` présent, sinon retourner `null` (skip).
2. Générer le nom Karma : `claude --print` avec **env nettoyé**
   (`const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env`), prompt Karma
   (types : `feat|fix|docs|refactor|test|chore|perf`), timeout ~30 s. Normaliser via
   `toKarmaKebab()` (repris de `autoRenameBranch.ts`). Échec/vide/identique → retourner `null`
   (dégradation gracieuse : garder `wip-`).
3. **Résoudre le nom sans collision AVANT tout move** (`resolveKarmaName`, pure/testable) :
   partir de `<karma>` et incrémenter `-2`, `-3`, … tant que **le dossier
   `<project_path>/.worktrees/<name>` existe** (`fs.existsSync`) **OU** que **la branche existe**
   (`git branch --list <name>` non vide). Résultat : `finalName` + `newPath` définitifs.
   (`project_path` lu en DB, pas de strip fragile.)
4. Kill des tmux liés : `tmux kill-session -t <sessionId>` **et** `-t <sessionId>-shell`
   (le `ShellTerminal` tourne au cwd du worktree — cf. git.ts qui gère ces deux sessions).
5. `git worktree move <old> <newPath>` puis `git -C <newPath> branch -m <finalName>`.
   Le nom ayant été résolu sans collision à l'étape 3, `branch -m` ne devrait pas échouer ; s'il
   échoue malgré tout, le retry **repart du path courant** (`git worktree move <newPath> <newPath-N>`),
   **jamais** de `<old>` (déjà déplacé). En dernier recours (échec persistant) → `catch` → `null`.
6. Update DB : `worktree_path = newPath`, `branch = karma` pour cette session.
7. Retourner `{ branch: karma, worktreePath: newPath, cwd: newPath }`.

Tout échec (claude, move, branch) → `catch` → retourner `null` : le worktree n'a pas bougé, la
session SDK n'a pas encore été relocalisée, on garde `wip-`.

### Orchestration dans `terminal.ts`

Le handler `stream-user-message` devient asynchrone pour le premier message d'une session `wip-` :

```
on 'stream-user-message':
  if !isRenameCandidate(sessionId):        // pas wip-, ou 1er message déjà passé
    sdkAgent.sendUserMessage(sessionId, text)      // inchangé
    return
  markRenaming(sessionId)                  // pose le flag; les msgs suivants sont bufferisés
  try:
    result = await renameWorktreeFromPrompt(sessionId, text)   // git+DB, peut être null
    if result:
      sdkAgent.relocate(sessionId, result.cwd)                 // recrée query au nouveau cwd
      broadcast({ type: 'stream-renamed', sessionId, branch, worktreePath, cwd })
    sdkAgent.sendUserMessage(sessionId, text)                  // le 1er prompt
  finally:
    flushRenaming(sessionId)               // pousse les msgs bufferisés, retire le flag
```

**Détection & sérialisation** :
- `isRenameCandidate` : la session est `wip-` (lu via `sdkAgent`/DB) **et** aucun 1er message
  n'a encore été consommé pour cette session. Un `Set firstMsgSeen` (par sessionId) marque la
  consommation dès l'entrée dans la branche rename.
- **Buffer anti-perte (#2)** : pendant `renaming`, tout `stream-user-message` entrant est empilé
  dans un `pendingWhileRenaming[sessionId]` (au lieu d'appeler `sendUserMessage`, qui serait
  perdu si la session est en cours de recréation). `flushRenaming` les rejoue **après**
  `relocate`. Ceci vit côté `terminal.ts` (proche du handler WS).

### Front-end

- **`stream-renamed`** (`useAgentChat`) : à réception → invalider React Query
  (`['git-worktrees', projectPath]`, `['sessions', 'active']`, `['agent-sessions', …]`) pour que
  `Workbench` recalcule `effectivePath` (repо/diff/terminal suivent le nouveau path).
- **Reconnecter sur *disponibilité* du cwd, pas sur sa *valeur* (#4 / relecture R2)** : l'effet WS
  de `useAgentChat` (1) **doit** se lancer quand `p.cwd` passe de `null` à un path (résolution async
  via React Query — sinon `stream-init` n'est **jamais** envoyé), mais (2) ne doit **pas** se
  relancer quand `p.cwd` change de valeur (post-rename), car `relocate` garde la connexion WS et
  l'effet fait `setMessages([])` (ligne 53). Correctif : faire dépendre l'effet de la **disponibilité**
  `const cwdReady = !!p.cwd` (deps : `[p.enabled, cwdReady, p.readOnly, p.sessionId, reconnectNonce]`),
  et lire la **valeur** courante de `p.cwd` via un `useRef` mis à jour à chaque render (utilisé au
  moment d'envoyer `stream-init`). Ainsi : `null → path` reconnecte (cwdReady false→true) ;
  `pathA → pathB` ne reconnecte pas (cwdReady reste true).
- **Sidebar** (`Sidebar.tsx`, #3) : `displayName` = **`wt.branch`** (nom Karma) en priorité
  pour une entrée worktree ; `agent_name` (persona/titre) déplacé en `Tooltip`.
- **Feedback UX (#3 relecture)** : pendant le rename (~≤30 s, `claude --print` bloquant), afficher
  un état léger « Nommage du worktree… » dans le composer/entête (piloté par un event
  `stream-renaming-start` optionnel émis avant le `await`, ou par le flag `busy`). Évite l'écran
  figé sans retour. À défaut, réutiliser l'indicateur `busy` existant.
- **Nettoyage** : retirer `onFirstUserMessage`/`submitRenameFromPrompt` de `Workbench.tsx` **et**
  la prop `onFirstUserMessage` de `AgentChatTab.tsx` ; retirer `maybeAutoRenameBranch` de
  `log/route.ts` ; supprimer `src/lib/autoRenameBranch.ts` (logique `toKarmaKebab` déplacée
  côté agent) et la route `/api/agent-sessions/rename-from-prompt`.

### Types

Ajouter les events stream dans les types partagés (`packages/agent/src/sdk/types` + front) :
- `{ type: 'stream-renamed'; sessionId: string; branch: string; worktreePath: string; cwd: string }`
- (optionnel) `{ type: 'stream-renaming-start'; sessionId: string }` pour le feedback UX.

### Tradeoff produit assumé (#8)

- La **sidebar** privilégie le slug Karma (`wt.branch`) ; le **header Workbench** garde
  `agent_name` (titre lisible de session) — cohérent : la sidebar liste des worktrees, le header
  décrit la session. `agent_name` reste accessible en tooltip dans la sidebar.
- Le mécanisme `logType:'title'` (log/route.ts) continue de peupler `agent_name` (aucun émetteur
  live détecté aujourd'hui) : conservé pour le header, sans impact sur l'affichage worktree.

## Cas limites

| Cas | Comportement |
| --- | --- |
| `claude --print` échoue/vide/identique | Garder `wip-`, **pas** de `relocate`, pousser le prompt sur la session existante. |
| Dossier **ou** branche cible déjà pris | Suffixe `-2`, `-3`, … (check `existsSync` + `git branch --list`, + retry si `branch -m` échoue). |
| `git worktree move` échoue (dirty/lock) | `catch` → `null`, session inchangée, prompt poussé sur l'ancien cwd. |
| tmux (`sessionId` et/ou `-shell`) ouvert | Les deux sessions tmux sont killées ; recréées au nouveau cwd à la prochaine attache. |
| 2e message pendant le rename | Bufferisé dans `pendingWhileRenaming`, rejoué après `relocate` (pas de `sendUserMessage` direct → **pas de perte**). |
| Changement de `cwd` prop côté front | N'entraîne **pas** de reconnexion WS ni de reset des messages (deps de l'effet corrigées). |
| Reconnexion WS pendant le rename | `relocate` garde les clients ; à la reconnexion, `stream-history` rejoue le transcript. |
| Session non-`wip-` (issue, current-branch) | Skip total, flux inchangé. |

## Hors scope (YAGNI)

- Sessions lancées depuis une issue (`feat/NN-slug`, déjà nommées).
- Sessions sur la branche courante (pas de worktree).
- Rename manuel du worktree via l'UI.
- Renommage rétroactif des worktrees `wip-` existants.

## Fichiers impactés

**Serveur agent** (`packages/agent/src/`)
- `sdk/renameWorktree.ts` — **nouveau** (génération nom + résolution collision + move + branch -m + DB + kill tmux). Extraire les parties pures (`toKarmaKebab`, `resolveKarmaName`, `computeNewPath`) pour les tester.
- `terminal.ts` — hook `stream-user-message` (détection 1er message, flag `renaming`, buffer `pendingWhileRenaming`, orchestration + broadcast `stream-renamed`).
- `sdk/sdkAgent.ts` — **nouvelle** méthode `relocate(sessionId, newCwd)` (crée un nouveau `SessionState`, réutilise clients/params, swap dans la map) **+ garde-fou d'identité dans `runLoop`** (`sessions.get(sessionId) === s`) autour du `stream-closed` et du `sessions.delete`.
- `sdk/types` (+ front) — events `stream-renamed` (+ `stream-renaming-start` optionnel).

**App Next** (`src/`)
- `hooks/useAgentChat.ts` — gérer `stream-renamed` (invalidations) ; faire dépendre l'effet WS de `cwdReady = !!p.cwd` (pas de la valeur) et lire `p.cwd` courant via `useRef` au `stream-init` (connecte à l'apparition du cwd, ne reconnecte pas sur changement de valeur → évite reset des messages).
- `components/workbench/Workbench.tsx` — retirer `submitRenameFromPrompt` + `onFirstUserMessage`.
- `components/agents/AgentChatTab.tsx` — retirer la prop `onFirstUserMessage`.
- `components/layout/Sidebar.tsx` — `displayName` = `wt.branch` prioritaire, `agent_name` en tooltip.
- `app/api/agent-sessions/log/route.ts` — retirer `maybeAutoRenameBranch` (+ import).
- `lib/autoRenameBranch.ts` — **supprimé**.
- `app/api/agent-sessions/rename-from-prompt/route.ts` — **supprimé**.
- `types/index.ts` — type d'event `stream-renamed` si les `StreamEvent` y sont centralisés.

## Tests (convention repo : logique pure uniquement)

- `toKarmaKebab()` : normalisation (accents, espaces, slashes, longueur, min 3 car., troncature).
- `resolveKarmaName()` : collision dossier **et** branche → suffixe `-2`, `-3` (avec fakes `existsSync`/`branchExists`).
- `computeNewPath()` : dérivation depuis `project_path` en DB.
- Décision `isRenameCandidate` : `wip-` + 1er message uniquement (fonction pure extraite).
- (UI/agent + orchestration WS vérifiés par `lint` + `tsc --noEmit` + `build` + run manuel :
  1er prompt renomme dossier+branche dans la sidebar ; 2e message non perdu ; pas de flash/reset chat.)
