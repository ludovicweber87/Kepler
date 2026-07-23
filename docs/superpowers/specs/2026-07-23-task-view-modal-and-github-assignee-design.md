# Task view modal + "Create issue from task" + GitHub default assignee

Date: 2026-07-23

## Contexte

Deux évolutions indépendantes touchant les tâches (`src/components/tasks/*`) et
la configuration GitHub :

1. **Modal view des tâches** — aujourd'hui, cliquer une tâche ouvre directement
   `TaskFormModal` en mode édition (`TaskRow` → `onEdit(task)`). On veut d'abord
   un modal en lecture seule, d'où on peut basculer en édition, et un bouton
   « Create issue from this task » qui crée une issue GitHub à partir de la tâche.
2. **User GitHub par défaut** — actuellement le « user courant » utilisé pour la
   création (assignee par défaut) et la lecture/fetch des issues vient de la
   session `gh` CLI (`auth.login`). On veut pouvoir le surcharger par un login
   GitHub configurable dans les Settings.

## Feature 1 — Modal view + Create issue from task

### Composants

- **Nouveau `src/components/tasks/TaskViewModal.tsx`** (lecture seule) :
  - Props : `open`, `task: Task | null`, `now: Date`, `onClose`, `onEdit(task)`,
    `onCreateIssue(task, repoFullName)`, état de création (`creating`).
  - Contenu : titre, description (texte), `UrgencyChip` + date d'échéance,
    chip repo, chip issue (`#123`, cliquable → `/task/{owner}/{repo}/{number}`)
    si liée, indicateur pinned.
  - Actions (footer) :
    - **Éditer** → ferme le view et ouvre `TaskFormModal` (édition).
    - **Create issue from this task** — visible **seulement si la tâche n'a pas
      d'issue liée**. Indicateur canonique : le triple
      `issue_owner && issue_repo && issue_number` (même logique que
      `TaskRow.hasIssue`, pour éviter une divergence visibilité/link).
      Comportement :
      - Si `task.repo_full_name` est défini → création directe en 1 clic.
      - Sinon → affiche un `Select` repo inline (depuis `useRepoPaths`) ; le
        bouton crée une fois un repo choisi. Si `repoPaths` est vide → bouton
        désactivé + hint « configure un repo dans les Settings ».
    - **Fermer**.

- **`src/components/tasks/TaskRow.tsx`** : renommer le handler `onEdit` en
  `onOpen` (le clic sur la ligne ouvre désormais le modal view). Les actions
  pin/delete au survol restent inchangées. ⚠️ Mettre à jour conjointement le
  `rowProps` de `TasksPage.tsx` (qui passe aujourd'hui `onEdit`) et le `onClick`
  de la ligne.

- **`src/components/tasks/TasksPage.tsx`** : gérer deux états de modal :
  - `viewTask: Task | null` (modal view)
  - `editTask: Task | null` + `formOpen` (modal formulaire, existant)
  - Le clic ligne → `setViewTask`. « Éditer » (depuis le view) → ferme le view,
    ouvre le form sur la même tâche.

### Création + auto-link

- Réutilise `useCreateIssue()` : `createIssue({ owner, repo, title, body })` où
  `title = task.title`, `body = task.description ?? ''`. **Pas d'assignee passé
  par le client** — le serveur applique l'assignee par défaut (Feature 2).
- Au succès (`{ number, html_url }`), lier l'issue à la tâche via
  `updateTask({ id, issue_owner: owner, issue_repo: repo, issue_number: number,
  issue_title: task.title })`. Le chip `#number` apparaît alors dans la ligne.
- Snackbar succès (`useSnackbar`). En cas d'erreur, snackbar erreur.
- `useCreateIssue.onSettled` invalide déjà `repo-issues` + `dashboard` : pas
  d'invalidation supplémentaire à ajouter après l'auto-link.

## Feature 2 — User GitHub par défaut (global)

### Stockage

- Clé `app_settings` : **`github_default_assignee`** (valeur = login GitHub, ou
  vide). Réutilise la table `appSettings` + le pattern `useAppSetting`.

### Résolution serveur

- **Nouveau `src/lib/githubAssignee.ts`** :
  ```ts
  export function resolveAssigneeLogin(fallbackLogin: string): string
  ```
  Lit `app_settings.github_default_assignee` via `db` (better-sqlite3/Drizzle,
  synchrone), renvoie la valeur trimmée si non vide, sinon `fallbackLogin`.

- Câblage dans les 3 routes qui filtrent par le user courant :
  1. `src/app/api/github/issue/create/route.ts` : l'assignee par défaut
     (quand `assignees` est vide) devient `resolveAssigneeLogin(auth.login)`
     au lieu de `auth.login`.
  2. `src/app/api/github/repo-issues/route.ts` :
     `fetchRepoAssignedIssues(owner, name, resolveAssigneeLogin(auth.login), token)`.
  3. `src/app/api/github/projects/route.ts` : remplacer
     `(await fetchUserLogin(auth.accessToken)).toLowerCase()` par
     `resolveAssigneeLogin(auth.login).toLowerCase()`. Note : `fetchUserLogin`
     est un appel réseau async vers `GITHUB_API/user` ; en mono-user gh CLI il
     renvoie la même valeur que `auth.login`, mais ce n'est pas garanti — on
     bascule volontairement sur `auth.login` + le setting (lecture DB synchrone,
     plus d'`await`).

> Les routes de lecture d'une issue précise (`/api/github/issue`) ne filtrent
> pas par assignee → aucun changement.

> `src/lib/githubAssignee.ts` importe `db` (better-sqlite3) : il ne doit être
> importé que par des routes serveur, jamais ré-exporté depuis un barrel
> partagé/client (sinon le bundling client casse).

### Validation du login (UI)

- **Nouvelle route `src/app/api/github/user/route.ts`** :
  `GET /api/github/user?login=<login>` → `{ login, avatar_url }` (200) ou 404 si
  le user n'existe pas. S'appuie sur GitHub REST `/users/{login}` avec le token
  de `requireAuth()`.

### UI Settings

- Nouvel `Accordion` « GitHub » dans `SettingsPanel.tsx` (même style que les
  autres sections) contenant :
  - `TextField` login (adornment `@`) lié à `useAppSetting('github_default_assignee')`.
  - Validation à la saisie (debounce / on blur) via `/api/github/user` :
    - login vide → helper text « vide = user gh CLI courant », état neutre.
    - login valide → avatar + coche verte, bouton Save actif.
    - login invalide → message d'erreur, Save désactivé.
  - Save persiste via `useAppSetting.save`.
- i18n : nouvelles clés dans le namespace `settings`.

## i18n

Nouvelles clés sur les 5 locales (`en/fr/es/de/pt`) :

- Namespace `tasks` : titre du modal view, bouton « Create issue from this
  task », label « Éditer », libellé de sélection de repo, messages snackbar
  succès/erreur de création d'issue.
- Namespace `settings` : titre de la section GitHub, label du champ assignee,
  helper text, états de validation (valide/invalide/vérification).

## Tests

- **`src/lib/githubAssignee.test.ts`** (Vitest, logique pure) : setting non vide
  → renvoie la valeur ; setting vide/absent → renvoie le fallback ; valeur avec
  espaces → trimmée. Mock du module `db`.
- Le reste (UI) se vérifie par `lint` + `tsc --noEmit` + `build` + run manuel,
  selon la convention du repo.

## Hors périmètre (YAGNI)

- Pas de mapping assignee par repo, pas de liste multi-users.
- Pas d'édition inline dans le modal view (on réutilise `TaskFormModal`).
- Pas de statut/colonne Project V2 imposé lors de la création depuis une tâche
  (comportement par défaut du board).
