# Diff scoping, bouton Changes & indicateur worktree mergé

Date : 2026-07-14
Statut : validé (design)

## Contexte

Trois évolutions autour du Workbench et des worktrees, indépendantes :

1. **Bug** — dans un nouveau worktree, le panneau Changes affiche aussi les changements déjà mergés par d'autres worktrees.
2. **UI** — dans la sidebar droite du Workbench, séparer « Changes » d'« Activity » : Changes devient un bouton qui ouvre la tab.
3. **Feature** — dans la liste des worktrees (sidebar gauche), marquer visuellement un worktree dont la branche est mergée.

Les trois touchent des unités séparées : serveur agent (git), composant Workbench (UI), Sidebar + nouvelle route GitHub. Aucun refactoring hors-scope.

---

## 1. Fix diff — base de comparaison = `origin/<base>`

### Problème

`packages/agent/src/routes/git.ts`, `GET /git/diff` :

- `getBaseBranch(cwd)` renvoie le nom de branche **locale** (`main`).
- Le diff fait `git merge-base main HEAD` puis `git diff <mergeBase>`.

Un worktree est créé depuis `origin/<base>` (cf. endpoints de création). Si le `main` **local** est en retard sur `origin/main` (constaté : `main` local `383eed9`, `origin/main` `69e3e25`), alors `merge-base(main local, HEAD)` pointe sur l'ancien `main` et `git diff` inclut tous les commits mergés dans `origin/main` depuis — c'est-à-dire le travail des autres worktrees déjà intégré.

### Solution

- Résoudre la base **distante** comme à la création : `git symbolic-ref refs/remotes/origin/HEAD` → `origin/<base>`. Fallback : tester `origin/main` puis `origin/master`, défaut `origin/main`.
- Calculer `git merge-base <originBase> HEAD` puis `git diff <mergeBase>` (et `--stat`).
- Pas d'ajout de `git fetch` (latence préservée). `origin/<base>` existe déjà localement car le worktree en a été créé.

### Portée du changement

- Extraire une fonction pure testable, ex. `resolveRemoteBaseRef(cwd): string` (renvoie `origin/main` ou `origin/master`), remplaçant/complétant `getBaseBranch` pour le chemin diff.
- Le chemin `else if (branch && branch !== baseBranch)` (diff hors répertoire worktree) est aligné sur la même base distante.

### Test

- Test unitaire sur la logique de résolution de base si elle est isolée en fonction pure (parsing de la sortie `symbolic-ref` / choix main vs master). Pas de test d'intégration git (convention repo : logique pure uniquement).

---

## 2. Changes = bouton dans la sidebar droite

### État actuel

`src/components/workbench/Workbench.tsx` :

- Zone centrale (75% gauche) pilotée par `centerTab: 'chat' | 'changes'`, via deux chips « Chat » / « Changes (N) » dans la barre d'onglets centrale.
- Sidebar droite : chips `Activity` / `Issue` pilotant le panneau haut (`topPanel`), + terminal empilé en bas.

### Cible

- **Retirer** le chip « Changes » de la barre d'onglets centrale. Il ne reste que le chip « Chat » (bouton de retour vers la conversation depuis Changes).
- **Ajouter** un bouton « Changes (N) » dans la rangée de chips de la sidebar droite (à côté d'Activity/Issue). Clic → `setCenterTab('changes')` : le diff s'ouvre dans le panneau central (comportement conservé).
- Distinction visuelle : Activity/Issue basculent le **panneau haut de la sidebar** (toggle) ; Changes est une **action** (variant/style distinct, non « sélectionné/désélectionné » comme un toggle de panneau) qui ouvre la tab centrale. Badge count `(N)` conservé, dérivé de `changedFiles.length`.
- `openChanges(filePath)` (appelé depuis l'activité / le chat) reste inchangé : il fait toujours `setCenterTab('changes')`.

### Portée du changement

- `Workbench.tsx` uniquement. La condition d'affichage du diff central (`centerTab === 'changes'`) est inchangée.
- Le bouton Changes de la sidebar est masqué/désactivé de façon cohérente quand il n'y a aucun changement (aligné sur la logique actuelle `changedFiles.length > 0`), mais reste sélectionnable si `centerTab === 'changes'` est déjà actif.

---

## 3. Indicateur worktree mergé (sidebar gauche)

### Détection

Via l'état PR GitHub (gère les squash-merges, contrairement à `git branch --merged`).

- **Nouvelle route Next** `GET /api/github/merged-branches?repo=owner/name` :
  - `requireAuth`.
  - Liste les PRs `state=closed` du repo (`per_page=100`, 1 appel).
  - Renvoie l'ensemble des `head.ref` dont `merged_at != null` : `{ branches: string[] }`.
- **Nouveau hook** `useMergedBranches(repoFullName)` :
  - React Query, `staleTime` ~5 min, `enabled: !!repoFullName`.
  - Retourne un `Set<string>` de branches mergées.

### Rendu

`src/components/layout/Sidebar.tsx` :

- Pour chaque worktree : `const isMerged = mergedBranches.has(wt.branch)`.
- Rendu si `isMerged` : **pastille de couleur verte** (success) devant/à côté du nom + nom de branche en **strikethrough**.
- Pas d'action cleanup dédiée — la suppression reste via le menu contextuel existant.
- i18n : label/tooltip « Merged » dans le namespace `sidebar`, 5 locales (`en/fr/es/de/pt`).

### Portée du changement

- `Sidebar.tsx`, nouveau hook `useMergedBranches.ts`, nouvelle route `src/app/api/github/merged-branches/route.ts`, fonction GitHub associée dans `src/lib/github.ts` si nécessaire, entrées i18n.

---

## Périmètre global & non-objectifs

- 3 unités indépendantes, livrables séparément.
- Non-objectifs : détection merge git locale, action de cleanup rapide, pagination des PRs closed au-delà de 100 (les worktrees actifs concernent des PRs récentes).
- Tests : logique pure uniquement (convention repo). UI validée par `lint` + `tsc --noEmit` + `build` + run manuel.
- Jamais de texte en dur : toutes les chaînes via next-intl.
