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

### 1. Route serveur — `GET /api/github/repo-issues?repo=<owner/name>`

Nouvelle route (ou route dédiée) qui, pour un repo donné :

1. `requireAuth()` → contexte `{ accessToken, login }`.
2. Récupère les issues ouvertes assignées au viewer **de ce repo uniquement** :
   `GET /repos/{owner}/{repo}/issues?assignee=<viewer>&state=open` (paginé, PRs exclues).
   → c'est cette étape qui fait remonter l'issue Devora (assignée, ouverte, hors Project).
3. Enrichit le statut via `fetchProjectColumns(nodeIds)` (fonction **existante** dans
   `src/lib/github.ts`) : batch GraphQL `node_id → [{ project, column }]`. Chaque issue
   reçoit `project_columns`. Une issue sans item Project reste sans colonne.
4. Renvoie `{ issues, fetchedAt }`.

En cas d'échec GitHub : renvoyer un payload avec flag `error` (comme la route `projects`
actuelle) plutôt que de crasher.

### 2. `statusColumns` (lanes du Kanban)

- Source primaire : `statusColumns` de la (des) config(s) connectée(s) qui couvre(nt) le
  repo actif — résolue via `view_repo_mappings` (même logique que
  `src/app/api/github/issue/move-status/route.ts`). Cette métadonnée est déjà persistée en
  DB, donc pas de fetch supplémentaire au montage.
- Fallback : union des colonnes présentes dans les issues fetchées + « No Status ».

### 3. Hook client — `useRepoIssues(effectiveRepo)`

- `useQuery({ queryKey: ['repo-issues', repo], queryFn: fetch /api/github/repo-issues,
  enabled: !!repo })`.
- Chaque tab = sa propre query → chargée seulement à la sélection, puis cachée par React
  Query. Changer de tab ne recharge pas les autres.
- `refresh()` → invalide/refetch uniquement `['repo-issues', repo]` du repo actif.
- Expose `{ issues, statusColumns, fetchedAt, isLoading, error, refresh }`.

### 4. `IssuesList`

- `effectiveRepo` (déjà présent) devient l'**entrée** du fetch au lieu d'un simple filtre.
- Supprimer `useProjectBoards` de cette page et le `useMemo` `repoIssues` (le serveur scope
  déjà par repo).
- `buildColumns`, la recherche (`search`), le détail d'issue (`IssueDetail`), les états de
  chargement/vide et l'auto-refetch (`useRefetchInterval`) : conservés, branchés sur la
  nouvelle source.
- L'auto-refetch appelle `refresh()` du repo actif au lieu de refrapper tous les projets.

### 5. Drag-to-status (à préserver)

- `handleStatusChange` a besoin de `__config` (org / projectNumber / ownerType) par issue
  pour appeler `useUpdateIssueStatus`. On rattache la config par repo→config (via
  `view_repo_mappings`, même résolution que `move-status`).
- Pour une issue **hors Project** (ex. Devora), le changement de statut est désactivé /
  no-op (pas d'item Project à muter). L'UI doit gérer proprement l'absence de `__config`.

### 6. Sync métadonnées Project (views / mappings / statusColumns)

- Aujourd'hui ce sync piggyback sur le board fetch global (`useEffect` dans `IssuesList`).
  Comme on arrête ce fetch global, on lit `statusColumns` depuis la config stockée.
- Le rafraîchissement de cette métadonnée (views/mappings/statusColumns depuis GitHub) est
  déplacé sur : refresh explicite et/ou l'écran Settings — hors du chemin de montage du
  Kanban. (Détail d'implémentation à préciser dans le plan ; ne doit pas réintroduire un
  fetch massif au montage.)

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

- **Pagination REST** : `/repos/{owner}/{repo}/issues?assignee=...` doit paginer (>100).
- **Batch `fetchProjectColumns`** : déjà en place (batches de 50, en parallèle), silencieux
  en cas de scope GraphQL manquant → dégrade proprement en « No Status ».
- **Résolution repo→config** : un repo peut être couvert par plusieurs configs connectées ;
  choisir la première (cohérent avec le dedup cross-projet actuel) et documenter.
- **Cohérence colonnes** : si le champ de statut du Project a un nom ≠ « Status », les
  issues tombent en « No Status » (comportement actuel déjà).

## Fichiers concernés (indicatif)

| Fichier | Changement |
|---|---|
| `src/app/api/github/repo-issues/route.ts` | **Nouveau** — REST assignées + enrichissement |
| `src/lib/github.ts` | Réutilise `fetchProjectColumns` ; éventuel helper repo-scoped assigned |
| `src/hooks/useRepoIssues.ts` | **Nouveau** hook lazy par repo |
| `src/components/issues/IssuesList.tsx` | Branché sur `useRepoIssues`, retrait `useProjectBoards` |
| `src/hooks/useProjectBoards.ts` | Plus utilisé par Issues (à conserver si d'autres conscommateurs, sinon nettoyer) |
| `src/app/api/github/issue/move-status/route.ts` | Réutilisé pour la résolution repo→config |
