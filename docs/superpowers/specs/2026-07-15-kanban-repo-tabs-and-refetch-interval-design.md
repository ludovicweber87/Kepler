# Kanban — tabs par repo & select d'auto-refetch

Date : 2026-07-15

## Contexte

Le Kanban (`src/components/issues/IssuesList.tsx`) fusionne aujourd'hui les issues
de tous les *project boards* connectés en un seul board (colonnes de statut en union,
via `useProjectBoards`). Le rafraîchissement est **uniquement manuel** (bouton refresh
→ `refresh()` qui tape GitHub avec `?refresh=1`). Le détail d'une issue
(`src/components/dashboard/IssueDetail.tsx`) est monté à la fois dans un `Dialog`
depuis le Kanban et sur la route `/task/[owner]/[repo]/[number]`.

## Objectif

1. **Tabs par repo** dans le Kanban : segmenter le board par dépôt configuré.
2. **Select d'auto-refetch** (Manuel · 1 min · 5 min · 10 min · 1 h · 24 h) sur le
   Kanban *et* sur le détail d'issue, avec l'intervalle persisté.

## Décisions

- **Source des tabs** : `useRepoPaths()` — un tab par `repo_full_name` configuré
  (Settings → repo paths). **Pas** de tab « Tout » : on affiche un seul repo à la fois.
- **Emplacement du select** : les deux pages (Kanban + IssueDetail).
- **Label du select** : « Rafraîchissement auto ».
- **Persistance** : intervalle mémorisé via `useAppSetting`
  (`issues.refetchIntervalMs`, `issueDetail.refetchIntervalMs`).

## Feature 1 — Tabs par repo (`IssuesList`)

- Fetch inchangé (`useProjectBoards` fusionne toujours toutes les issues).
- Nouvel état local `activeRepo` (défaut = 1ᵉʳ repo de `repoPaths`).
- Filtrage `issues.filter(i => i.repo_full_name === activeRepo)` **avant**
  `buildColumns`. La recherche s'applique dans le repo actif.
- UI : `<Tabs>` MUI (conventions repo : `textTransform: none`, `minHeight: 40`),
  insérés entre le header et les colonnes.
- Empty-states :
  - Aucun repoPath configuré → CTA vers `/settings` (réutilise le pattern
    `noViewsSelected`).
  - Repo configuré sans issue → tab affiché, colonnes vides.
- **Conséquence assumée** : les issues d'un repo *non* présent dans `repoPaths` ne
  sont visibles dans aucun tab (comportement voulu).

## Feature 2 — `RefetchIntervalSelect` (partagé)

- Nouveau composant `src/components/shared/RefetchIntervalSelect.tsx`.
- Options en ms : `0` (Manuel, défaut), `60_000`, `300_000`, `600_000`,
  `3_600_000`, `86_400_000`.
- Props : `value: number`, `onChange: (ms: number) => void`, `label?: string`.
- `<Select>` MUI compact + icône `AutorenewRounded`.
- Câblage :
  - **Kanban** : `useEffect` → `setInterval(refresh, interval)` quand `interval > 0`,
    nettoyage au changement/démontage.
  - **IssueDetail** : `useIssue(owner, repo, number, { refetchInterval })` — React
    Query gère le polling (issue + commentaires).
- Persistance via `useAppSetting` (valeur stockée en string, parsée en number).

## i18n

Clés partagées dans le namespace `common` (label + libellés d'intervalle),
réutilisées par les deux pages. Ajout dans les 5 locales (en, fr, es, de, pt).

## Non-objectifs (YAGNI)

- Pas de tab « Tout » agrégé.
- Pas de réordonnancement des tabs (ordre = ordre `repoPaths`).
- Pas de polling de la timeline d'issue (lazy, `enabled: false`).
- Pas de badge de compteur par tab.

## Tests

Convention repo : logique pure uniquement. Le peu de logique testable
(mapping intervalle ms ↔ label, filtrage par repo) peut être couvert si extrait ;
sinon vérification par `lint` + `tsc --noEmit` + `build` + run manuel.
