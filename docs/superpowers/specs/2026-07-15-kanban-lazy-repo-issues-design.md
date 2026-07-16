# Kanban Issues — fetch paresseux par tab + issues hors Project

**Date** : 2026-07-15
**Statut** : validé (design), en attente du plan d'implémentation

## Contexte & problème

La page Kanban Issues (`/issues`) souffre de deux problèmes :

1. **Lenteur** — au montage, `useProjectBoards` lance une requête par Project V2 connecté
   (`useQueries`), pagine tous les items GraphQL de chaque projet, fusionne le tout, puis
   filtre côté client par le repo de la tab active. On paie donc le fetch complet de tous
   les projets même pour afficher une seule tab.

2. **Issues assignées invisibles** — le Kanban ne lit **que** les items présents dans un
   Project V2 connecté ET assignés au viewer ET ouverts. Une issue assignée à l'utilisateur
   mais **non ajoutée à un Project V2** (cas concret : une issue du repo Devora) n'apparaît
   jamais, quelle que soit l'optimisation. C'est une limite du modèle de données, pas un
   bug de fetch.

### État actuel (résumé du flux)

- Tabs = repos de `repo_paths` (Settings), pas les views du Project.
- `useProjectBoards(boardConfigs)` → `GET /api/github/projects?...` (1 par projet) →
  `fetchProjectV2Data` (GraphQL paginé) → filtre « assigné au viewer » → open + dedup →
  `mergeConnectedBoards`.
- `IssuesList` filtre ensuite `issues` par `effectiveRepo` (client), groupe par statut
  (`buildColumns`), rend les `KanbanColumn`.

## Décisions de conception (validées)

- **Stratégie perf** : fetch paresseux par tab — ne fetcher que le repo de la tab active,
  à la sélection, avec cache par tab.
- **Source par tab** : REST des issues ouvertes assignées du repo + enrichissement du
  statut via Project V2. Une issue hors Project tombe en « No Status ».
- **Clé de scope** : par `repo_full_name` de la tab active.
- **Changement de sémantique assumé** : le Kanban n'est plus « ce qui est dans mes
  Projects » mais « mes issues ouvertes assignées, par repo » ; le Project V2 ne sert plus
  qu'à ranger les issues en colonnes.

## Design

### 0. Principe directeur — toute la résolution est serveur

Sans le board global, la résolution « repo → config connectée → project retenu → lanes »
est **centralisée dans la route serveur**. Le client ne manipule plus `view_repo_mappings`
ni les configs pour le rendu du Kanban ; il consomme un payload déjà réconcilié. Cela lève
les contradictions 1–4 de la revue : une seule source de vérité pour les lanes ET le
statut par issue ET le `__config` de drag.

Helper partagé **`resolveConfigForRepo(repo, configs): ProjectV2Config | null`** extrait dans
`src/lib/projectViews.ts` (ou `src/lib/boardMerge.ts`), réutilisé par la nouvelle route ET
par `move-status/route.ts` (aujourd'hui la logique est inline dans le handler). Règle : parmi
les configs connectées, retenir la **première** dont `view_repo_mappings[].repos` contient le
repo (cohérent avec le dedup cross-projet actuel « première occurrence gardée »).

### 1. Route serveur — `GET /api/github/repo-issues?repo=<owner/name>`

Route dédiée (nom figé : `/api/github/repo-issues`). Pour un repo donné :

1. `requireAuth()` → `{ accessToken, login }`.
2. Récupère les issues ouvertes assignées au viewer **de ce repo uniquement** :
   `GET /repos/{owner}/{repo}/issues?assignee=<login>&state=open` — **paginé**
   (`per_page=100`, garde-fou d'un nombre max de pages), **PRs exclues** (`!issue.pull_request`).
   Chaque item REST porte `node_id` (dépendance explicite ; c'est le cas de l'API REST
   issues). → cette étape fait remonter l'issue Devora (assignée, ouverte, hors Project).
3. Résout la config couvrante via `resolveConfigForRepo(repo, connectedConfigs)`
   (configs lues depuis la table SQLite `project_configs`).
4. Enrichit le statut via `fetchProjectColumns(nodeIds)` (fonction **existante**,
   `src/lib/github.ts`) → `node_id → [{ project, column }]`.
5. **Réconciliation lane/statut (résout revue #2 et #3)** : pour chaque issue, la colonne
   retenue est celle de l'entrée `project_columns` dont `project` (titre) == `project_title`
   de la **config couvrante**. Si aucune entrée ne matche (issue hors de ce Project, ou hors
   Project tout court) → « No Status ». On garantit ainsi que la lane d'une issue appartient
   toujours au même Project que celui qui fournit `statusColumns`.
6. Attache `__config` (`org` / `projectNumber` / `ownerType`) à chaque issue **couverte par
   le Project retenu** ; les issues hors Project restent sans `__config` (drag désactivé).
7. Renvoie `{ issues, statusColumns, fetchedAt, error? }` où :
   - `statusColumns` = `statusColumns` de la config couvrante (déjà persistée en DB, pas de
     fetch supplémentaire). **Fallback** : si aucune config couvrante (ou config couvrante
     sans `statusColumns` persistées), les lanes se réduisent à `[« No Status »]` — puisque
     sans config la réconciliation §1.5 fait tomber toutes les issues en « No Status ». Le
     Kanban reste alors une simple liste mono-colonne, ce qui est le comportement voulu pour
     un repo assigné hors Project (cas Devora).
   - `error` : flag renvoyé (payload non-crashant) en cas d'échec GitHub, comme la route
     `projects` actuelle.

### 2. Hook client — `useRepoIssues(effectiveRepo)`

- `useQuery({ queryKey: ['repo-issues', repo], queryFn: fetch /api/github/repo-issues,
  enabled: !!repo })`.
- Chaque tab = sa propre query → chargée seulement à la sélection, puis cachée par React
  Query. Changer de tab ne recharge pas les autres.
- `refresh()` → invalide/refetch uniquement `['repo-issues', repo]` du repo actif.
- Expose `{ issues, statusColumns, fetchedAt, isLoading, error, refresh }` — tout vient déjà
  réconcilié du serveur, le client ne recalcule rien (ni lanes, ni `__config`).

### 3. `IssuesList`

- `effectiveRepo` (déjà présent) devient l'**entrée** du fetch au lieu d'un simple filtre.
- Supprimer `useProjectBoards` de cette page et le `useMemo` `repoIssues` (le serveur scope
  déjà par repo).
- `buildColumns`, le détail d'issue (`IssueDetail`), les états de chargement/vide et
  l'auto-refetch (`useRefetchInterval`) : conservés, branchés sur la nouvelle source.
- L'auto-refetch appelle `refresh()` du repo actif au lieu de refrapper tous les projets.
- **Recherche (`search`)** : sa portée devient le repo actif (changement assumé, cohérent
  avec le lazy per-tab). Avant, elle balayait l'ensemble mergé ; désormais elle filtre les
  issues du repo courant. Ce n'est pas une régression silencieuse mais un choix explicite.

### 4. Drag-to-status (à préserver)

- `handleStatusChange` consomme le `__config` **déjà attaché par le serveur** (§1.6) pour
  appeler `useUpdateIssueStatus`. Le client ne résout plus rien.
- Pour une issue **hors Project** (ex. Devora) → pas de `__config` → drag désactivé / no-op
  (pas d'item Project à muter). L'UI gère proprement l'absence de `__config`.

### 5. Sync métadonnées Project (views / mappings / statusColumns)

- Aujourd'hui ce sync piggyback sur le board fetch global (`useEffect` dans `IssuesList`) et
  persiste views/mappings/statusColumns dans la config. On arrête ce fetch global.
- **Déclencheur minimal retenu** : la métadonnée (views / `view_repo_mappings` /
  `statusColumns`) est rafraîchie depuis GitHub **sur l'écran Settings** (qui appelle déjà
  `/api/github/projects`) lors de la (re)connexion / sélection d'un Project. Le Kanban, lui,
  lit toujours la version persistée. Conséquence documentée : un repo nouvellement mappé
  n'aura des lanes correctes qu'après un passage/refresh dans Settings — acceptable pour un
  usage mono-utilisateur. Aucun fetch massif n'est réintroduit au montage du Kanban.

## Comportement attendu (gains / changements)

- ✅ Fetch scopé à 1 repo, lazy par tab → page beaucoup plus rapide.
- ✅ Les issues assignées ouvertes **hors Project V2** remontent (bug Devora corrigé).
- ⚠️ Sémantique du Kanban modifiée (assumée) : issues assignées par repo ; le Project ne
  fait plus que le rangement en colonnes.

## Hors périmètre (YAGNI)

- Pas de refonte des tabs (restent = repos de `repo_paths`).
- Pas d'union permanente REST + Project pour tous les repos (rejeté : plus lourd, dédup).
- Pas de changement du flux Dashboard (`/api/github`, `useGitHub`) — indépendant.
- Pas de fetch serveur « filtre par repo sur Project V2 » (rejeté : coût GitHub inchangé).

## Risques / points de vigilance

- **Pagination REST** : `/repos/{owner}/{repo}/issues?assignee=...` doit paginer
  (`per_page=100` + garde-fou nombre de pages).
- **`node_id` requis** : l'enrichissement dépend du `node_id` de chaque issue REST — présent
  sur l'API REST issues, à conserver dans le mapping issue → `nodeIds`.
- **Batch `fetchProjectColumns`** : déjà en place (batches de 50, en parallèle), silencieux
  en cas de scope GraphQL manquant → dégrade proprement en « No Status ».
- **Résolution repo→config** : un repo peut être couvert par plusieurs configs connectées ;
  `resolveConfigForRepo` retient la première (cohérent avec le dedup cross-projet actuel).
- **Cohérence colonnes** : la lane d'une issue et les `statusColumns` viennent du **même**
  Project (§1.5) → plus de « colonne existante mais lane absente ». Si le champ de statut du
  Project a un nom ≠ « Status », les issues tombent en « No Status » (comportement actuel).

## Fichiers concernés (indicatif)

| Fichier | Changement |
|---|---|
| `src/app/api/github/repo-issues/route.ts` | **Nouveau** — REST assignées + enrichissement + réconciliation |
| `src/lib/projectViews.ts` (ou `boardMerge.ts`) | **Nouveau** helper `resolveConfigForRepo(repo, configs)` partagé |
| `src/lib/github.ts` | Réutilise `fetchProjectColumns` ; éventuel helper REST repo-scoped assigned |
| `src/hooks/useRepoIssues.ts` | **Nouveau** hook lazy par repo |
| `src/components/issues/IssuesList.tsx` | Branché sur `useRepoIssues`, retrait `useProjectBoards` + `repoIssues` |
| `src/app/api/github/issue/move-status/route.ts` | Refactor pour consommer `resolveConfigForRepo` (logique repo→config extraite) |
| `src/hooks/useProjectBoards.ts` | Plus utilisé par Issues — nettoyer si aucun autre consommateur |
