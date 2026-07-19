# Design — Étape « groupe de personas » après le choix worktree/issue

Date : 2026-07-19
Composant : `src/components/agents/AgentTerminalModal.tsx`

## Contexte

Aujourd'hui, dans le wizard de création de session (`AgentTerminalModal`), le
step `launch-mode` propose 4 cards au même niveau : `worktree`,
`current-branch`, `existing-branch` et `group`. La card `group` est un **mode**
qui remplace le lancement solo : elle mène à `select-group` puis `branch`, et
lance un **pipeline** de personas (`/pipeline-runs`) au lieu d'une session solo.

On veut que le choix du groupe de personas ne soit plus un mode parallèle, mais
une **étape** qui vient **après** le choix de la cible (worktree ou issue), avec
une option « Aucun (agent solo) » par défaut.

## Objectif

Réordonner le step machine pour que `select-group` soit l'avant-dernière étape
des parcours **worktree** et **issue** uniquement, avec une option « Aucun » qui
préserve le lancement solo actuel.

## Décisions (validées)

- L'étape groupe s'affiche **toujours** après la cible, avec « Aucun (agent
  solo) » sélectionné par défaut. Aucun → session solo ; un groupe → pipeline.
- Scope : **worktree + issue seulement**. `current-branch` et `existing-branch`
  restent solo direct, sans étape groupe (le pipeline crée un worktree, il ne
  tourne pas sur ces modes).
- Lancement depuis une issue : **plus d'auto-launch instantané** — on affiche
  d'abord l'étape groupe, puis on lance.
- Back depuis `select-group` en mode issue : **ferme le modal** (pas d'étape
  amont). En mode worktree : retour à `branch`.

## Nouveau flow

```
project → launch-mode ┬─ worktree        → branch → select-group → launch
                      ├─ current-branch  → launch direct (solo, inchangé)
                      └─ existing-branch → existing-branch → launch direct (solo, inchangé)

(ouverture depuis une issue) → select-group → launch   [plus d'auto-launch]
```

## Changements détaillés

### Step machine & état

- `launchMode` : l'union perd `'group'` → `'worktree' | 'current-branch' |
  'existing-branch' | null`.
- Le type `step` conserve les mêmes valeurs (`select-group` existe déjà).
- `selectedGroupId = null` signifie désormais **« Aucun (agent solo) »** (valide
  par défaut), et non « rien de sélectionné ».

### Step `launch-mode`

- Suppression de la card `group` (il reste 3 cards).
- `handleLaunchModeNext` : suppression du cas `group` ; `worktree` → `branch`.

### Step `branch`

- Le bouton principal passe de « Lancer » à « Suivant » et fait
  `setStep('select-group')` au lieu d'appeler `handleLaunch`.
- Le champ « issue URL » et son fetch (`onBlur`) restent inchangés.

### Step `select-group`

- Ajout d'une card **« Aucun (agent solo) »** en tête, sélectionnée par défaut.
- Le bouton principal devient **« Lancer »** et appelle `handleLaunch`.
- Back contextuel : mode worktree → `branch` ; mode issue → `onClose()`.

### `handleLaunch`

- Remplacer la condition `launchMode === 'group' && selectedGroupId` par
  simplement `if (selectedGroupId)` → branche pipeline (`/pipeline-runs`,
  inchangée). Sinon → session solo (inchangée).
- Naming, fetch issue et step transitoire `linking-issue` : inchangés.

### Parcours issue

- L'effet d'auto-launch (`autoLaunchedRef`) ne lance plus directement : il fait
  `setStep('select-group')`. Le lancement effectif se fait via le bouton
  « Lancer » de `select-group` → `handleLaunch` (avec `issueContext` déjà connu,
  donc pas de fetch supplémentaire).

### i18n

- Nouvelles clés `launchModal` dans les **5 locales** (`en/fr/es/de/pt`) :
  `groupNone`, `groupNoneDesc` (+ éventuel sous-titre `selectGroupSubtitle`).
- Suppression des clés `groupMode` / `groupModeDesc` (ancienne card devenue
  inutile).

## Hors scope

- Aucun changement DB, API Next, ni serveur agent (`/pipeline-runs` inchangé).
- Pas de support du pipeline sur `current-branch` / `existing-branch`.
- Pas de refonte plus large du wizard.

## Vérification

- `tsc --noEmit`, `lint`, `build` OK.
- Run manuel : worktree → branch → select-group (Aucun) → session solo ;
  worktree → branch → select-group (groupe) → run pipeline ; issue → select-group
  (Aucun) → session solo ; issue → select-group (groupe) → run pipeline ;
  current-branch / existing-branch → solo direct (inchangés).
