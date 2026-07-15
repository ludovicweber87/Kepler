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
- Submit → `handleLaunch` avec `mode = 'existing-branch'` et la branche sélectionnée.

### 2. Session & provision (serveur agent)

Le mode de lancement se propage jusqu'à `POST /git/provision`.
`mode` passe de `'worktree' | 'current-branch'` à
`'worktree' | 'current-branch' | 'existing-branch'`.

- **Création session** (`handleLaunch`) : session en `provisioning` avec
  `branch = <branche choisie>` (pas de nom auto `wip-*`). Le payload transporte le
  mode `existing-branch` et un flag indiquant si la branche source est distante
  (`isRemote`).
- **Étape `worktree` de provision** — selon le mode :
  - `worktree` → inchangé : `git worktree add <path> -b <branch> origin/<HEAD>`
  - **`existing-branch`** → `git fetch origin` (best-effort) puis :
    - branche **locale** : `git worktree add <path> <branch>`
    - branche **distante seule** : `git worktree add --track -b <branch> <path> origin/<branch>`
      (crée la branche locale de tracking)
- `worktreePath` dérivé du nom de branche (slashes → tirets), comme aujourd'hui.
- `worktree_path` enregistré en fin de provision (`done`).

### 3. Listing des branches (local + distant)

`GET /git/branches` étendu avec le param optionnel `?includeRemote=true` :

- **Local** : `git for-each-ref --sort=-committerdate refs/heads`
  (nom, date, subject, author) + flag `isCurrent`.
- **Distant** (si `includeRemote`) : `refs/remotes`, en excluant `origin/HEAD`.
- **Dédup** : si `feat/x` existe en local, l'entrée `origin/feat/x` est droppée.
  Chaque entrée porte `isRemote: boolean`.
- **Déjà en worktree** : parse de `git worktree list --porcelain` → `isCheckedOut: boolean`
  (→ désactivé dans l'`Autocomplete`).
- Tri global par date de dernier commit décroissante.
- **Rétro-compatibilité** : sans le param → comportement actuel (local only), réponse identique.

Le type `Branch` (défini dans `src/hooks/useBranches.ts`) gagne `isRemote` et
`isCheckedOut`. `useBranches(path, { includeRemote })` passe le param.

### 4. Gestion d'erreurs

- Branche introuvable / déjà checkout / fetch échoué → SSE `event: error` dans provision
  (mécanisme existant), affiché par `CreationProgress`.
- Le select désactive déjà les branches en worktree, évitant le cas d'erreur le plus courant.

### 5. i18n

Nouveaux libellés dans les 5 locales (`en/fr/es/de/pt`), namespace `launchModal` :
carte « Depuis une branche existante », titre d'étape, badges `local`/`distant`,
placeholder de recherche, libellés d'erreur.

### 6. Tests (convention repo = logique pure uniquement)

- Helper pur côté agent : **dédup + tri + flags** des branches (local/remote/checkedOut).
  Test unitaire Vitest.
- Helper pur côté agent : **choix des arguments git** selon `mode` + `isRemote`
  (retourne le tableau d'args `git worktree add ...`). Test unitaire Vitest.

## Fichiers impactés

- `src/components/agents/AgentTerminalModal.tsx` — 3ᵉ carte + étape `existing-branch`.
- `src/components/workbench/CreationProgress.tsx` — passage du mode `existing-branch` au payload.
- `src/hooks/useBranches.ts` — param `includeRemote`, types `isRemote`/`isCheckedOut`.
- `packages/agent/src/routes/git.ts` — `GET /git/branches?includeRemote`,
  `POST /git/provision` (branche `existing-branch`), helpers purs extraits.
- `src/config/translate/{en,fr,es,de,pt}.json` — libellés `launchModal`.
- Tests Vitest pour les helpers purs.
