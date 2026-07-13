# Kanban unifié « mes issues assignées » — suppression de la sélection de tracks

**Date** : 2026-07-13
**Statut** : Design validé, prêt pour le plan d'implémentation

## Contexte & objectif

Aujourd'hui, dans **Settings**, l'utilisateur connecte des projets GitHub Project V2 et **coche des views (« tracks »)**. Le **Kanban** (`IssuesList`) affiche **un onglet par track sélectionnée**, chaque onglet montrant les issues de cette view (déjà filtrées sur l'user connecté) réparties en colonnes de statut.

Nouvelle feature : **supprimer la sélection de tracks**. On récupère automatiquement **toutes les issues ouvertes assignées à l'user connecté**, sur **tous les boards déclarés** et **toutes leurs tracks**, et on les affiche dans **un seul Kanban unifié**. Plus aucune notion de « tracks sélectionnées » (ni Settings, ni Kanban, ni ailleurs).

## Décisions validées

1. **Scope des boards** : les projets Project V2 restent **déclarés dans Settings** (org + n° projet + ownerType) + chemins repo locaux. On retire uniquement la sélection de tracks.
2. **Structure du Kanban** : **un seul board unifié**, colonnes = **statuts**. Plus d'onglets.
3. **Ordre des colonnes** : **union des `statusColumns` de toutes les configs, dans l'ordre des configs** (concat + dédup en conservant la première occurrence). `No Status` en fallback (fin de liste) pour les issues sans statut.
4. **Filtre issues** : **uniquement les issues ouvertes** (`state === 'open'`). On exclut les closed/merged.
5. **Assignation** : issues assignées à l'user connecté (déjà filtré côté backend par `viewer` login).

## Architecture

Le backend fait déjà l'essentiel : `/api/github/projects` filtre les items du board sur l'user connecté et les mappe en `GitHubIssue` (via `projectItemToIssue`, qui porte `node_id`, `repo_full_name`, `state`, et `project_columns: [{ project, column: status }]`). Il les regroupe par view — c'est ce regroupement qu'on aplatit.

### 1. Backend — `src/app/api/github/projects/route.ts`

- Aujourd'hui : construit `boardIssuesByView` (Record<viewName, GitHubIssue[]>) via `matchViewItems` par view.
- **Nouveau** : construire aussi/plutôt un **`boardIssues: GitHubIssue[]`** = **tous** les items du board **assignés à l'user** (filtre `it.assignees.some(a => a.login === viewer)` déjà présent) et **ouverts** (`state === 'open'` après mapping), **dédupliqués par `node_id`**, indépendamment des views.
- Conserver `statusColumns` (ordre du board) dans la réponse.
- `boardIssuesByView` / `viewRepoMappings` : **plus utilisés** par le Kanban → peuvent être retirés de la réponse (ou laissés inertes ; préférer retirer pour clarté). `views` peut rester si utile au cache métadonnées, sinon retirer.
- Le cache SQLite `project_boards` (payload JSON) stocke la nouvelle forme de réponse. La lecture read-through / `?refresh=1` reste inchangée dans son principe.

### 2. Hook — `src/hooks/useProjectBoards.ts`

- **Entrée** : toutes les configs **connectées** (plus de filtre `selectedViews.length > 0`).
- **Sortie** : au lieu de `issuesByView: Map`, exposer :
  - `issues: (GitHubIssue & { __config: { org: string; projectNumber: number; ownerType?: 'organization' | 'user' } })[]` — **fusion** des `boardIssues` de tous les boards, **dédup par `node_id`**, chaque issue **taguée avec sa config source** (nécessaire pour muter le statut du bon projet au drag).
  - `statusColumns: string[]` — **union** des `statusColumns` de toutes les configs, dans l'ordre des configs, dédupliquée.
  - `fetchedAt`, `isLoading`, `error`, `refresh()` — conservés.
- Le tag de config est ajouté côté hook au moment du `combine` (on connaît `configs[i]` par board).

### 3. Kanban — `src/components/issues/IssuesList.tsx`

- **Supprimer les onglets** (`selectedViewMappings`, `activeTab`, `tabs`, `safeTab`, `DraggableTabs` liés aux views).
- Consommer `useProjectBoards(configs)` (toutes les configs) → `issues`, `statusColumns`.
- **Colonnes** = `statusColumns` (union) + `No Status` en fallback (uniquement si des issues n'ont pas de statut).
- **Groupement** : `issue.project_columns?.[0]?.column ?? 'No Status'`.
- **Recherche** : conservée (filtre titre/numéro sur la liste fusionnée).
- **Drag & drop** : au drop dans une colonne, appeler `useUpdateIssueStatus` avec **la config taguée de l'issue** (`issue.__config.org` / `projectNumber` / `ownerType`) + `issueNodeId = issue.node_id` + `newStatus = column`.
  - **Limite v1** : si la colonne cible n'existe pas dans le set de statuts du projet de l'issue, la mutation GitHub échoue → afficher un snackbar d'erreur et rollback optimiste (déjà géré par le hook). En pratique les boards partagent le même set de statuts.
- L'optimistic update de `useUpdateIssueStatus` cible `['project-board', org, projectNumber]` (inchangé) ; comme le Kanban lit désormais `issues` dérivé de ces query keys, l'update se propage.

### 4. Settings — `src/components/settings/SettingsPanel.tsx`

- **Retirer toute l'UI de sélection de views** : `toggleView`, l'affichage de la liste des views cochables, `selectedViews`, l'auto-fetch des views pour cette sélection.
- **Conserver** : connexion/déconnexion d'un **projet** (org + n° projet + ownerType) et la gestion des **chemins repo locaux** (`repo_paths`).
- `ProjectSection` se simplifie : connecter un projet = enregistrer la config (`org`, `projectNumber`, `ownerType`) sans fetch de views ni cases à cocher.
- Les `statusColumns` nécessaires au Kanban proviennent du fetch board (`/api/github/projects`) au runtime, pas de Settings.

### 5. Config / hook `useProjectConfig` / schéma

- **Pas de migration DB.** Les colonnes `selected_views`, `view_order`, `view_repo_mappings`, `active_view`, `views` restent en base mais **ne sont plus lues/écrites** comme pilotes.
- `useProjectConfig` : retirer (ou cesser d'exposer) `selectedViewMappings` et tout helper de sélection de views utilisé par le Kanban/Settings. Conserver la liste des configs (org/projectNumber/ownerType) et les CRUD de connexion de projet.
- À l'écriture d'une config (connexion projet), écrire des valeurs neutres pour les champs views (`selected_views: []`, etc.) plutôt que de les piloter.

## Types (`src/types/index.ts`)

- Ajouter le type de tag de config sur les issues du board unifié (ex. via un type local au hook `BoardIssue = GitHubIssue & { __config: {...} }`, ou un champ optionnel documenté). Pas de refonte de `GitHubIssue`.

## Comportements conservés

- Filtrage assigné-à-moi (backend, `viewer` login).
- Cache SQLite `project_boards` + `refresh()` explicite (bouton refresh du Kanban).
- Détail issue, création de branche depuis une issue, mutation de statut (avec contexte projet).

## Hors scope (YAGNI v1)

- Regroupement/filtre par projet dans le Kanban unifié (colonnes = statuts uniquement).
- Découverte automatique des boards (ils restent déclarés en Settings).
- Migration DB pour supprimer les colonnes `view_*` (laissées inertes).
- Réconciliation fine des statuts hétérogènes entre projets (union simple ; drop invalide → erreur gérée).

## Risques / points à vérifier pendant le plan

1. **Drag cross-projet** : confirmer que `useUpdateIssueStatus` + `/api/github/issues` acceptent org/projectNumber par appel (ils les prennent déjà en params) et que l'issue taguée fournit tout le nécessaire (`node_id`, `newStatus`).
2. **Dédup multi-board** : une même issue peut apparaître dans plusieurs boards → dédup par `node_id` (garder la première, avec sa config ; edge rare).
3. **`No Status`** : n'ajouter la colonne que si au moins une issue tombe dedans (éviter une colonne vide permanente).
4. **Consommateurs de `selectedViewMappings` / `issuesByView`** : grep pour retirer proprement tous les usages (IssuesList, Settings, éventuels autres) avant suppression.
5. **i18n** : retirer les libellés liés aux tracks/views devenus inutiles ; ajouter d'éventuels libellés du board unifié. Pas de texte en dur.
6. **`useProjectBoards` gate** : l'ancien filtre `selectedViews.length > 0` disparaît → s'assurer qu'une config sans issue assignée ne casse pas (board vide = 0 issue, OK).
