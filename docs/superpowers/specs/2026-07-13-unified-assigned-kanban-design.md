# Kanban unifié « mes issues assignées » — suppression de la sélection de tracks

**Date** : 2026-07-13
**Statut** : Design validé, prêt pour le plan d'implémentation

## Contexte & objectif

Aujourd'hui, dans **Settings**, l'utilisateur connecte des projets GitHub Project V2 et **coche des views (« tracks »)**. Le **Kanban** (`IssuesList`) affiche **un onglet par track sélectionnée**, chaque onglet montrant les issues de cette view (déjà filtrées sur l'user connecté) réparties en colonnes de statut.

Nouvelle feature : **supprimer la sélection de tracks**. On récupère automatiquement **toutes les issues ouvertes assignées à l'user connecté**, sur **tous les boards déclarés** et **toutes leurs tracks**, et on les affiche dans **un seul Kanban unifié**. Plus aucune notion de « tracks sélectionnées » (ni Settings, ni Kanban, ni ailleurs).

## Décisions validées

1. **Scope des boards** : les projets Project V2 restent **déclarés dans Settings** (org + n° projet + ownerType) + chemins repo locaux. On retire uniquement la sélection de tracks. **Nouveau mécanisme d'opt-in** : un **toggle « Connecter » par projet** (flag `connected` persisté). Ceci remplace l'ancien signal implicite `selectedViews.length > 0` qui distinguait « board voulu » de « board simplement découvert ».
   > Contexte : aujourd'hui `SettingsPanel` auto-découvre TOUS les projets de TOUTES les orgs du viewer et **auto-enregistre une config au montage** (`ProjectSection`). Le seul opt-in réel était de cocher une view. Sans ce nouveau flag, le Kanban unifié agrégerait tous les projets de toutes les orgs.
2. **Structure du Kanban** : **un seul board unifié**, colonnes = **statuts**. Plus d'onglets.
3. **Ordre des colonnes** : **union des `statusColumns` de toutes les configs, dans l'ordre des configs** (concat + dédup en conservant la première occurrence). `No Status` en fallback (fin de liste) pour les issues sans statut.
4. **Filtre issues** : **uniquement les issues ouvertes** (`state === 'open'`). On exclut les closed/merged.
5. **Assignation** : issues assignées à l'user connecté (déjà filtré côté backend par `viewer` login).

## Architecture

Le backend fait déjà l'essentiel : `/api/github/projects` filtre les items du board sur l'user connecté et les mappe en `GitHubIssue` (via `projectItemToIssue`, qui porte `node_id`, `repo_full_name`, `state`, et `project_columns: [{ project, column: status }]`). Il les regroupe par view — c'est ce regroupement qu'on aplatit.

### 0. Schéma / migration — `src/db/schema.ts` + `src/db/migrations/`

- Ajouter à `projectConfigs` une colonne **`connected: integer({ mode: 'boolean' })` défaut `false`** (SQLite : `integer` 0/1).
- **Migration additive** générée par `npx drizzle-kit generate` (`ALTER TABLE project_configs ADD connected integer DEFAULT 0`). Les configs auto-enregistrées existantes deviennent `connected = false` (donc exclues du Kanban tant que l'user ne les connecte pas) — comportement voulu.
- Rappel : les migrations ne tournent plus au build (fix récent `NEXT_PHASE`), donc l'additif est sûr.

### 1. Backend — `src/app/api/github/projects/route.ts`

- Aujourd'hui : construit `boardIssuesByView` (Record<viewName, GitHubIssue[]>) via `matchViewItems` par view. **Ne filtre PAS** l'état open/closed (changement de comportement réel, pas un simple aplatissement).
- **Nouveau** : la réponse expose un **`boardIssues: GitHubIssue[]`** = **tous** les items du board **assignés à l'user** (filtre `it.assignees.some(a => a.login === viewer)` déjà présent) **et ouverts** (`projectItemToIssue(...).state === 'open'`), **dédupliqués par `node_id`**, indépendamment des views.
- Conserver `statusColumns` (ordre du board).
- **Remplacer `boardIssuesByView` par `boardIssues`** comme forme canonique du payload (les patchs optimiste + cache serveur sont mis à jour en conséquence, cf. §3bis). `viewRepoMappings`/`views` : retirés de la réponse (plus utilisés).
- Le cache SQLite `project_boards` (payload JSON) stocke la nouvelle forme. Lecture read-through / `?refresh=1` : principe inchangé.

### 2. Hook — `src/hooks/useProjectBoards.ts`

- **Entrée** : les configs **`connected === true`** (remplace `selectedViews.length > 0`).
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
- L'optimistic update de `useUpdateIssueStatus` cible `['project-board', org, projectNumber]` ; **mais sa fonction de patch doit être réécrite** (cf. §3bis) car elle dépend de l'ancienne forme `boardIssuesByView`.
- **Clé React** : `KanbanColumn.tsx:90` utilise `key={issue.id}` (= numéro d'issue **local au repo**, non unique). En board fusionné multi-repos, deux issues `#12` de repos différents entrent en collision → **passer à `key={issue.node_id}`**.

### 3bis. Patchs de statut à réécrire pour la nouvelle forme (`boardIssues`)

Le passage de `boardIssuesByView` → `boardIssues` casse deux patchs qui dépendent de l'ancienne forme (sinon le drag semble « ne rien faire » jusqu'au prochain refresh) :

- **`src/hooks/useUpdateIssueStatus.ts`** (`updateBoardIssues`, ~ligne 37-54) : réécrire pour patcher `payload.boardIssues` (array plat) au lieu de `payload.boardIssuesByView` (Record).
- **`src/lib/projectBoardCache.ts`** (`ProjectBoardPayload` + `patchSnapshotStatus`, ~ligne 6-13 / 49-74), appelé par `src/app/api/github/issues/route.ts:48` après chaque mutation : mettre à jour le type de payload et la logique de patch pour `boardIssues`. Sans ça, le snapshot SQLite dérive de GitHub après chaque drag.

### 4. Settings — `src/components/settings/SettingsPanel.tsx`

- **Retirer l'UI de sélection de views** : `toggleView`, la liste des views cochables, l'auto-fetch lié à cette sélection.
- **Nouveau** : sur chaque `ProjectSection`, un **toggle « Connecter ce board »** qui écrit `connected: true/false` dans la config. (L'auto-save au montage peut rester pour créer la ligne, mais avec `connected: false` par défaut — la ligne n'entre au Kanban que si l'user active le toggle.)
- **Conserver** : gestion des **chemins repo locaux** (`repo_paths`).
- Le compteur `totalConfigured` (`SettingsPanel.tsx:711`) : `configs.filter(c => c.selectedViews.length > 0)` → `configs.filter(c => c.connected)`.
- Les `statusColumns` du Kanban proviennent du fetch board au runtime, pas de Settings.

### 4bis. Onboarding gate — `src/components/layout/AppShell.tsx`

- `hasProjects = configs.some(c => c.selectedViews.length > 0)` (`AppShell.tsx:44`, utilisé ~:103) → **`configs.some(c => c.connected)`**. Sinon le bouton « Launch » d'onboarding reste bloqué (les `selectedViews` seront toujours vides).

### 5. Config / hook `useProjectConfig`

- **Migration additive** : ajout de `connected` (cf. §0). Les colonnes `selected_views`, `view_order`, `view_repo_mappings`, `active_view`, `views` restent en base mais **ne pilotent plus** rien (laissées inertes).
- `useProjectConfig` : retirer (ou cesser d'exposer) `selectedViewMappings` et les helpers de sélection de views ; exposer `connected` sur les configs + une mutation pour le basculer. Conserver la liste des configs et les CRUD.

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

1. **Drag cross-projet** : ✅ confirmé — `PATCH /api/github/issues` accepte déjà `issueNodeId, newStatus, org, projectNumber, ownerType` par appel (`route.ts:13`), et `GitHubIssue` porte `node_id`/`repo_full_name`/`state`/`project_columns` (`types/index.ts`).
2. **Consommateurs de `selectedViews`/`selectedViewMappings`/`boardIssuesByView`/`issuesByView`** à rebrancher/retirer (grep exhaustif) : `IssuesList.tsx:60`, `AppShell.tsx:44,103`, `SettingsPanel.tsx:711`, `useUpdateIssueStatus.ts` (updateBoardIssues), `projectBoardCache.ts` (patchSnapshotStatus + type), `route.ts` projects. Ne rien oublier avant suppression.
3. **Dédup multi-board** : une même issue peut apparaître dans plusieurs boards → dédup par `node_id` (garder la première + sa config ; edge rare).
4. **`No Status`** : n'ajouter la colonne que si au moins une issue tombe dedans.
5. **Filtre open** : changement de comportement réel (le backend ne filtre pas l'état aujourd'hui) — ajouter `state === 'open'`.
6. **i18n** : retirer les libellés liés aux tracks/views devenus inutiles ; ajouter le libellé du toggle « Connecter » + éventuels libellés du board unifié. Pas de texte en dur, 5 locales.
7. **`useProjectBoards` gate** : le filtre passe de `selectedViews.length > 0` à `connected === true` → un board connecté sans issue assignée = 0 issue, OK (ne pas casser).
