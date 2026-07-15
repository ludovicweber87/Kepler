# Créer un worktree depuis une branche existante (locale ou distante)

**Date :** 2026-07-15
**Statut :** Design validé

## Contexte & problème

Le flow principal de lancement d'agent (`AgentTerminalModal` → `POST /git/provision`)
crée toujours le worktree depuis `origin/HEAD` (fallback `origin/main`), en créant une
**nouvelle** branche : `git worktree add <path> -b <branche> origin/<base>`.

Il n'existe aucun moyen, depuis l'UI, de démarrer un worktree sur une **branche
existante** — locale ou distante — pour reprendre un travail déjà commencé. Par ailleurs
`GET /git/branches` ne liste que les branches **locales** (pas de `-a`/`-r`).

## Objectif

Permettre, à la création d'un worktree, de **checkout directement une branche existante**
(locale ou distante) dans le worktree — sans créer de nouvelle branche.

Sémantique retenue (**option B**) : le worktree checkout la branche choisie telle quelle.
Pas de nouvelle branche par-dessus.

### Hors périmètre (YAGNI)

- Le flow legacy `CreateBranchModal` / `POST /git/branch` (création depuis une issue) reste inchangé.
- L'endpoint bas-niveau `POST /git/worktrees` (résiduel) reste inchangé.
- Pas de renommage auto (convention `wip-*` → Karma) pour ce mode : la branche existe déjà.

## Design

### 1. Flow UI — `AgentTerminalModal`

Ajout d'une **3ᵉ carte** dans l'étape `launch-mode` :

| Carte | Comportement |
|---|---|
| Worktree (existant) | nouvelle branche depuis `origin/HEAD` |
| Current branch (existant) | travaille sur la branche courante, pas de worktree |
| **Depuis une branche existante** (nouveau) | worktree qui checkout une branche existante (locale ou distante) |

- Le state `step` passe de `'project' | 'launch-mode' | 'branch'` à
  `'project' | 'launch-mode' | 'branch' | 'existing-branch'`.
- La nouvelle carte mène à l'étape **`existing-branch`** : un `Autocomplete` MUI
  (recherche texte) listant les branches dédupliquées, triées par date de dernier
  commit décroissante, avec badge `local`/`distant`. Les branches déjà checkout dans
  un worktree sont **désactivées**.
- Champ optionnel URL d'issue GitHub conservé (identique à l'étape `branch`).
- Submit → un handler dédié (ou `handleLaunch` paramétré par `mode`) : contrairement
  à l'actuel `handleLaunch`, **aucun fallback `randomWorktreeName()`** — la branche est
  obligatoire (sélectionnée), jamais auto-générée. La session est créée avec
  `launch_mode = 'existing-branch'` et `branch = <nom court sélectionné>`.

### 2. Session & provision (serveur agent)

**Transport du mode.** Le mode de lancement doit survivre à la redirection modal →
Workbench. `handleLaunch` ferme le modal et redirige vers `/workbench?session=<id>` ;
`CreationProgress` relit ensuite la session **depuis SQLite** et construit le payload
`/git/provision`. Aujourd'hui `CreationProgress` hardcode `mode = 'worktree'`, et la
table `agent_sessions` ne porte aucune notion de mode.

→ On **persiste le mode** via une nouvelle colonne `launch_mode` sur `agent_sessions`
(migration Drizzle), valeurs `'worktree' | 'current-branch' | 'existing-branch'`
(défaut `'worktree'` pour compat). `handleLaunch` l'écrit à la création ;
`CreationProgress` lit `session.launch_mode` et le passe au payload provision.

**Pas de flag `isRemote` transporté.** Le distinguo local/distant est **résolu côté
serveur** au moment de la provision (via `git show-ref --verify refs/heads/<branch>`),
ce qui évite d'avoir à le persister et garde une seule source de vérité.

**Nom de branche stocké.** `session.branch` = **nom court** de la branche
(`feat/x`), jamais préfixé `origin/`. Le select ne renvoie que le nom court ;
`worktreePath` reste dérivé du nom court (slashes → tirets).

`POST /git/provision` : `mode` passe de `'worktree' | 'current-branch'` à
`'worktree' | 'current-branch' | 'existing-branch'`.

- **Création session** (`handleLaunch`) : session en `provisioning` avec
  `branch = <branche choisie>` (nom court, pas de nom auto `wip-*`),
  `launch_mode = 'existing-branch'`.
- **Étape `worktree` de provision** — selon le mode :
  - `worktree` → inchangé : `git worktree add <path> -b <branch> origin/<HEAD>`
  - **`existing-branch`** → `git fetch origin` (best-effort), puis résolution serveur :
    - branche **locale existante** (`show-ref refs/heads/<branch>` OK) :
      `git worktree add <path> <branch>`
    - sinon branche **distante** (`origin/<branch>`) :
      `git worktree add --track -b <branch> <path> origin/<branch>`
      (crée la branche locale de tracking, nom court)
- **Étapes `copy-files`, `setup` et enregistrement `worktree_path`** : aujourd'hui
  gardées derrière `if (body.mode === 'worktree')`. On élargit la condition à
  **tout mode produisant un worktree** (`worktree` ou `existing-branch`) : la copie
  des `.env*` / symlink `node_modules`, le `setupScript` et l'écriture de
  `worktree_path` en fin de provision (`done`) s'appliquent aussi à `existing-branch`.
- **Collision de chemin.** Le guard existant `if (!existsSync(worktreePath))` est
  conservé : si le worktree existe déjà, on skip la création `git worktree add`
  (réutilisation), même comportement que le mode `worktree`.

### 3. Listing des branches (local + distant)

`GET /git/branches` étendu avec le param optionnel `?includeRemote=true` :

- **Local** : listing local, nom court + date/subject/author + flag `isCurrent`.
  L'endpoint actuel utilise `git branch --format=... --sort=-committerdate` + un
  `git rev-parse --abbrev-ref HEAD` séparé pour `isCurrent`. On conserve cette
  approche (le `isCurrent` continue de venir de `rev-parse`, pas du marqueur `*`) et
  on l'étend, plutôt que de la réécrire.
- **Distant** (si `includeRemote`) : `refs/remotes`, en excluant `origin/HEAD`.
- **Dédup** : si `feat/x` existe en local, l'entrée `origin/feat/x` est droppée.
  Chaque entrée porte `isRemote: boolean`. Les noms exposés sont **courts** (sans
  préfixe `origin/`).
- **Déjà en worktree** : parse de `git worktree list --porcelain` → `isCheckedOut: boolean`
  (→ désactivé dans l'`Autocomplete`). La branche courante du repo principal apparaît
  dans cette liste : elle sera donc `isCheckedOut` et désactivée — comportement
  **attendu** (git refuse de checkout deux fois la même branche), pas un bug.
- Tri global par date de dernier commit décroissante.
- **Rétro-compatibilité** : sans le param → comportement actuel (local only), réponse identique.

Le type `Branch` (défini dans `src/hooks/useBranches.ts`) gagne `isRemote` et
`isCheckedOut`. `useBranches(path, { includeRemote })` passe le param.

### 4. Gestion d'erreurs

- Branche introuvable / déjà checkout / fetch échoué → SSE `event: error` dans provision
  (mécanisme existant), affiché par `CreationProgress`.
- Le select désactive déjà les branches en worktree, évitant le cas d'erreur le plus courant.
- Cas spécifique du mode distant : `origin/<branch>` peut avoir disparu entre le listing
  et la provision (ex. fetch prune). Message d'erreur explicite plutôt que le stderr git brut.

### 5. i18n

Nouveaux libellés dans les 5 locales (`en/fr/es/de/pt`), namespace `launchModal` :
carte « Depuis une branche existante », titre d'étape, badges `local`/`distant`,
placeholder de recherche, libellés d'erreur.

### 6. Tests (convention repo = logique pure uniquement)

- Helper pur côté agent : **dédup + tri + flags** des branches (local/remote/checkedOut).
  Test unitaire Vitest.
- Helper pur côté agent : **choix des arguments git** selon `mode` + `isRemote`
  (retourne le tableau d'args `git worktree add ...`). Test unitaire Vitest.
  Note : `isRemote` ici = booléen **résolu côté serveur** (via `git show-ref`) et passé
  en entrée du helper, **pas** un flag transporté/persisté.

## Fichiers impactés

- `src/db/schema.ts` + `src/db/migrations/` — nouvelle colonne `launch_mode` sur
  `agent_sessions` (défaut `'worktree'`).
- `src/components/agents/AgentTerminalModal.tsx` — 3ᵉ carte + étape `existing-branch`
  + handler dédié (écrit `launch_mode`, pas de fallback `wip-*`).
- `src/components/workbench/CreationProgress.tsx` — lit `session.launch_mode` (au lieu
  du `mode` hardcodé) et le passe au payload provision.
- `src/hooks/useBranches.ts` — param `includeRemote`, types `isRemote`/`isCheckedOut`.
- `packages/agent/src/routes/git.ts` — `GET /git/branches?includeRemote`,
  `POST /git/provision` (branche `existing-branch` + condition worktree élargie),
  helpers purs extraits.
- `src/types/index.ts` / types de session — champ `launch_mode`.
- `src/config/translate/{en,fr,es,de,pt}.json` — libellés `launchModal`.
- Tests Vitest pour les helpers purs (dédup/tri/flags + choix des args git).
