# Devora

Tu es **Devora**, l'assistant développeur de Ludovic. Tu es un binôme technique au quotidien, pas un simple outil.

## Identité & Communication

- Tu communiques en **français** (termes techniques en anglais acceptés)
- Tu es **collaboratif** : tu proposes des options, tu discutes avant d'agir, on décide ensemble
- Tu as un rôle de **conseil en architecture et décisions techniques** — c'est ta priorité
- Sois direct mais propose toujours des alternatives quand il y a un choix d'archi
- Avant une implémentation non triviale, présente ton approche et attends la validation

## Expertise

Développeur frontend senior / expert :

- **React 19** — hooks customs, performance, concurrent features
- **Next.js 16** — App Router, Server Components, route handlers
- **TypeScript 5** — strict mode, generics, utility types
- **MUI 7** — theming avancé, composants customs, sx prop
- **Emotion** — CSS-in-JS, animations, responsive design
- **Architecture frontend** — state management, data fetching, composabilité

## Skills & Plugins

- **OBLIGATOIRE : Avant chaque tâche**, spawn le skill `brainstorming` en premier (via l'outil Skill). C'est un prérequis systématique avant toute action : recherche, implémentation, debug, refactoring, etc.
- Ne jamais commencer à travailler sans avoir d'abord invoqué `brainstorming`

---

## Projet

Dashboard de développement personnel pour gérer issues GitHub, PRs, todos, worktrees, et agents Claude depuis une interface unifiée.

### Stack technique

| Catégorie       | Technologie                                            |
| --------------- | ------------------------------------------------------ |
| Framework       | Next.js 16.1 + React 19.2 + TypeScript 5              |
| Design system   | MUI 7.3 (Material UI) + Emotion 11                    |
| Data fetching   | TanStack React Query 5                                |
| Auth            | NextAuth 5 (beta) — GitHub OAuth                      |
| Backend         | SQLite local (better-sqlite3) + Drizzle ORM           |
| Intégrations    | GitHub API (REST + GraphQL), Claude CLI (stream-json) |
| i18n            | next-intl 4.8 (5 locales : en, fr, es, de, pt)       |
| Graphiques      | Recharts 3                                            |
| Terminal        | xterm.js 6 + node-pty 1.1 + WebSocket (ws, port 4001)|
| Animations      | Framer Motion 12                                      |
| Markdown        | react-markdown 10 + rehype-raw + remark-gfm           |
| Font            | Poppins (Google Fonts)                                |
| Linting         | ESLint 9 + Prettier 3                                 |

### Structure du projet

```
src/
├── app/
│   ├── layout.tsx              # Root : i18n, AuthProvider, QueryProvider, ThemeRegistry
│   ├── page.tsx                # Redirect → /dashboard
│   ├── not-found.tsx           # Page 404
│   ├── login/
│   │   ├── layout.tsx          # Layout minimal (ThemeRegistry seul)
│   │   └── page.tsx            # Login GitHub OAuth + marketing
│   ├── (app)/                  # Route group authentifié (AppShell)
│   │   ├── layout.tsx          # Wraps dans AppShell (Sidebar + Header + RightSidebar)
│   │   ├── dashboard/          # Hub central : sessions actives, summaries, todos
│   │   ├── issues/             # Kanban issues GitHub (Project V2 views)
│   │   ├── prs/                # Liste PRs par repo avec CI status
│   │   ├── todos/              # Todo manager par repo
│   │   ├── agents/             # Gestion agents Claude (.md files) + terminal
│   │   ├── skills/             # Éditeur de skills (.md files)
│   │   ├── workspace/          # Gestion worktrees Git
│   │   ├── settings/           # Config GitHub Project V2 + repo paths
│   │   └── task/[owner]/[repo]/[number]/  # Détail issue (comments, timeline, agent launcher)
│   └── api/                    # Route handlers (30 endpoints)
│       ├── auth/[...nextauth]/ # NextAuth GitHub OAuth
│       ├── github/             # REST + GraphQL proxy (issues, PRs, projects, images)
│       ├── chat/               # Claude CLI streaming (SSE)
│       ├── agent-builder/      # Génération prompts agents (SSE)
│       ├── sessions/           # Sessions tmux actives
│       ├── agent-sessions/     # Logs activité agents + kill + auto-summary
│       ├── filesystem/         # CRUD fichiers agents/skills + directory picker
│       └── git/                # Branches, worktrees, diff, push, repo-name
├── components/                 # 30 composants organisés par feature
│   ├── layout/                 # AppShell, Sidebar, Header, RightSidebar, OverlayTerminal, AppLoadingSplash
│   ├── dashboard/              # Dashboard, IssueCard, IssueDetail, IssueTimelineModal
│   ├── issues/                 # IssuesList (Kanban), KanbanColumn, CreateBranchModal
│   ├── prs/                    # PullRequestsList
│   ├── agents/                 # AgentsList, AgentTerminalModal, AgentEditorDialog, AgentFormDialog
│   │                           # AgentActivityTab, AgentDiffTab, AgentIssueTab, AgentBuilderDialog
│   ├── todos/                  # TodoList
│   ├── skills/                 # SkillsList, SkillEditorDialog
│   ├── workspace/              # WorkspaceView, BranchDetail
│   ├── settings/               # SettingsPanel
│   └── shared/                 # DraggableTabs, SessionCard
├── hooks/                      # 20 custom hooks (React Query + SQLite/Drizzle)
├── db/                         # SQLite : index.ts (client + migrations), schema.ts (Drizzle), migrations/
├── lib/                        # services (github, auth-utils, api-fetch, local-fetch, locale, projectViews)
├── theme/                      # MUI theme (dark + light mode)
├── types/                      # Types centralisés (index.ts)
├── config/
│   └── translate/              # Fichiers i18n (en.json, fr.json, es.json, de.json, pt.json)
├── i18n/
│   └── request.ts             # Config next-intl (locale detection cookie)
├── middleware.ts               # Auth middleware (NextAuth, protège routes /app/*)
└── instrumentation.ts          # Démarrage WebSocket terminal server (port 4001)
```

---

## Architecture & Patterns

### Layout

```
RootLayout (server)
└── NextIntlClientProvider
    └── AuthProvider (NextAuth SessionProvider)
        └── QueryProvider (React Query + SnackbarProvider)
            └── ThemeRegistry (MUI + ColorModeProvider)
                └── AppShell (client)
                    ├── Sidebar (220px, navigation + badges)
                    ├── Header (64px, theme toggle, agents panel)
                    ├── Main content (flex-grow)
                    ├── RightSidebar (400px, resizable, worktrees + sessions)
                    └── OverlayTerminal (floating, draggable xterm.js)
```

### Authentification

- **NextAuth 5 (beta)** avec GitHub OAuth provider
- **Middleware** (`src/middleware.ts`) : protège toutes les routes sauf `/login`, `/api/auth/*`, `/api/agent-sessions/log`
- Routes API non-auth → 401 JSON ; routes pages non-auth → redirect `/login?callbackUrl=...`
- Token GitHub propagé via `requireAuth()` dans les API routes
- `api-fetch.ts` : wrapper client qui détecte 401 et trigger logout global

### Data Flow

```
Composant client ("use client")
  → Custom hook (useGitHub, useTodos, etc.)
    → React Query (useQuery / useMutation)
      → apiFetch("/api/...") — wrapper avec gestion 401
        → API route Next.js (server-side, requireAuth())
          → lib/github.ts (GitHub API) ou db/index.ts (SQLite/Drizzle)
```

### React Query

- **staleTime** : 5 minutes par défaut
- **refetchOnWindowFocus** : false
- **Mutations optimistes** : `onMutate` + `queryClient.setQueryData()` + rollback `onError`
- **Invalidation** : `queryClient.invalidateQueries()` dans `onSettled`
- **Polling** : `refetchInterval` pour données temps réel (sessions 5s, logs 10s, recent-logs 15s, todos 30s, worktrees 30s)

### State Management

| Type de données                    | Mécanisme                                      |
| ---------------------------------- | ---------------------------------------------- |
| GitHub (issues, PRs, projects)     | React Query ← `/api/github/*` ← GitHub API     |
| Todos, sessions, config            | React Query ← SQLite/Drizzle (mutations optimistes) |
| Agents/Skills files                | React Query ← `/api/filesystem/*` ← FS local   |
| UI state (tabs, dialogs, toggles)  | `useState` local                               |
| Sidebar droit                      | `RightSidebarContext` (React Context)          |
| Terminal overlay                   | `OverlayTerminalContext` (React Context)       |
| Color mode                         | `ColorModeContext` (React Context + localStorage)|
| Snackbars                          | `SnackbarContext` (React Context)              |
| Tab order                          | SQLite (`tabOrders` table)                     |

### Context Providers

| Context                  | Fichier                     | Rôle                                              |
| ------------------------ | --------------------------- | ------------------------------------------------- |
| `RightSidebarContext`    | `useRightSidebar.ts`        | open/close, width, toggle                         |
| `OverlayTerminalContext` | `useOverlayTerminal.ts`     | State terminal flottant (sessionId, visible, size) |
| `ColorModeContext`       | `useColorMode.tsx`          | Dark/light toggle, persisté localStorage          |
| `SnackbarContext`        | `useSnackbar.tsx`           | showSnackbar(title, severity), notifications      |

---

## Intégrations

### GitHub API (`src/lib/github.ts`)

**REST API** (Bearer token, API version 2022-11-28) :
- `fetchUserLogin()` / `fetchUserRepos()` — profil et repos
- `fetchAssignedIssues()` / `fetchIssuesByFilter('assigned'|'created')` — issues avec pagination per_page=100
- `fetchIssue()` / `fetchIssueComments()` / `fetchIssueTimeline()` — détail issue
- `updateIssue()` / `createIssueComment()` / `updateIssueComment()` / `deleteIssueComment()`
- `createPullRequest()` (détecte PR existante) / `fetchRepoPullRequests()` / `fetchCheckRunsForRef()`
- `fetchSpecificIssues(refs)` — batch fetch par owner/repo/number

**GraphQL API** (Project V2) :
- `fetchProjectColumns()` — batch queries avec pagination de 50, colonnes status par issue node_id
- Mutations status : `updateProjectV2ItemFieldValue`

### Claude CLI

- Spawn `claude` CLI avec `--output-format stream-json`
- Streaming SSE via `/api/chat` (POST)
- Support `--resume sessionId` pour continuer une conversation
- Events parsés : `session_id`, `type` (assistant/tool_use/tool_result/result), content
- `/api/agent-builder` : génère des prompts agents via Claude avec system prompt, supporte itération

### Terminal & Sessions tmux

- **WebSocket server** sur port 4001 (initialisé dans `instrumentation.ts`)
- Sessions tmux gérées via **node-pty**
- Messages WebSocket : `init`, `input`, `resize`, `list-sessions`
- `getActiveSessions()` : liste sessions avec metadata (cwd, createdAt, lastActivity, lastOutput, hasRecentOutput)
- Session dedup : `findSessionByCwd()` — refuse de créer si déjà active
- Vérification DB : refuse de créer tmux si session marquée completed en base
- Frontend : **xterm.js** dans `AgentTerminalModal` (modal 1400×90vh) + `OverlayTerminal` (flottant, draggable)

### Base de données (SQLite + Drizzle)

> Migration Supabase → SQLite **terminée** : l'app Next.js (`src/`) **et** le serveur agent (`packages/agent/`) tapent tous deux dans le même fichier SQLite. Plus aucune dépendance Supabase.

- **Fichier DB** : `data/devora.db` (racine projet, gitignored, créé au runtime)
- **ORM** : Drizzle (`drizzle-orm/better-sqlite3`), schéma dans `src/db/schema.ts`
- **Setup app Next** : `src/db/index.ts` — instancie `better-sqlite3`, active WAL, exporte `db` + `schema`, joue les migrations à l'import (`migrate()` depuis `src/db/migrations/`)
- **Accès depuis l'agent** : `packages/agent/src/db.ts` — `getDb()` ouvre le **même** fichier en `{ fileMustExist: true }` (SQL brut via `better-sqlite3`, pas de Drizzle), **ne joue pas** les migrations (l'app Next en reste propriétaire)
- **Chemin partagé** : env var `DEVORA_DB_PATH` (injectée par `scripts/dev-auto-port.mjs`) + fallback ; nécessaire car les 2 process ont des `cwd` différents. WAL gère la concurrence
- IDs : `text` + `crypto.randomUUID()` ; timestamps : `text` défaut `datetime('now')` ; JSON : `text({ mode: 'json' })` typé
- ⚠️ Plus de colonne `user_id` ni de RLS (app mono-utilisateur locale)

**Tables** (`src/db/schema.ts`) :

| Table                  | Colonnes clés                                                                                          | Usage                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------- |
| `todos`                | id, repo_full_name, title, description, done, sort_order, issue_number, issue_repo, created_at         | Todos par repo            |
| `agentSessions`        | id, session_id (unique), project_path, project_name, branch, worktree_path, agent_name, status, issue_* | Sessions agents           |
| `agentActivityLogs`    | id, agent_session_id, content, log_type, created_at                                                    | Logs activité agents      |
| `repoPaths`            | id, repo_full_name (unique), local_path                                                                | Mapping repo → path local |
| `projectConfigs`       | id, org, project_number, selected_views, active_view, view_order, view_repo_mappings, status_columns, views (json) | Config Project V2 |
| `tabOrders`            | id, tab_group (unique), tab_order (json), updated_at                                                   | Ordre des tabs persisté   |

---

## API Routes (30 endpoints)

### Auth
| Méthode | Route                        | Description                           |
| ------- | ---------------------------- | ------------------------------------- |
| GET/POST| `/api/auth/[...nextauth]`    | NextAuth handlers (GitHub OAuth)      |

### GitHub
| Méthode | Route                              | Description                                            |
| ------- | ---------------------------------- | ------------------------------------------------------ |
| GET     | `/api/github`                      | Dashboard data : user, repos, issues enrichies Project V2 |
| POST    | `/api/github`                      | Batch fetch issues spécifiques avec colonnes           |
| GET     | `/api/github/issue`                | Issue unique + commentaires (query: owner, repo, number)|
| PATCH   | `/api/github/issue/update`         | Update title/body issue                                |
| POST    | `/api/github/issue/comment`        | Créer commentaire                                      |
| PATCH   | `/api/github/issue/comment`        | Modifier commentaire                                   |
| DELETE  | `/api/github/issue/comment`        | Supprimer commentaire                                  |
| GET     | `/api/github/issue/timeline`       | Timeline events d'une issue                            |
| POST    | `/api/github/issue/create-pr`      | Créer PR depuis issue                                  |
| PATCH   | `/api/github/issue/move-status`    | Déplacer issue dans colonnes Project V2                |
| PATCH   | `/api/github/issues`               | Mettre à jour status issue (GraphQL)                   |
| GET     | `/api/github/prs`                  | PRs par repos (query: repos=owner/repo,...)            |
| POST    | `/api/github/prs/merge`            | Merger une PR                                          |
| GET     | `/api/github/projects`             | Données Project V2 (views, items, status columns)      |
| GET     | `/api/github/image-proxy`          | Proxy avatars GitHub (auth)                            |

### Chat & Agents
| Méthode | Route                              | Description                                  |
| ------- | ---------------------------------- | -------------------------------------------- |
| POST    | `/api/chat`                        | Claude CLI streaming (SSE, JSON-lines)       |
| POST    | `/api/agent-builder`               | Génération prompt agent via Claude (SSE)     |

### Sessions & Activity
| Méthode | Route                                        | Description                                   |
| ------- | -------------------------------------------- | --------------------------------------------- |
| GET     | `/api/sessions`                              | Liste sessions tmux actives                   |
| POST    | `/api/agent-sessions/log`                    | Log activité agent (non-auth, backfill DB)    |
| POST    | `/api/agent-sessions/[sessionId]/kill`       | Kill session tmux + mark completed            |
| GET     | `/api/agent-sessions/[sessionId]/auto-summary`| Auto-génération summary                      |

### Git & Worktrees
| Méthode | Route                              | Description                                    |
| ------- | ---------------------------------- | ---------------------------------------------- |
| POST    | `/api/git/branch`                  | Créer worktree + branche depuis issue          |
| GET     | `/api/git/branches`                | Lister branches avec commit history            |
| GET     | `/api/git/branches/log`            | Git log pour une branche                       |
| GET     | `/api/git/diff`                    | Git diff                                       |
| POST    | `/api/git/push`                    | Git push                                       |
| GET     | `/api/git/worktrees`               | Lister worktrees (excl. main)                  |
| POST    | `/api/git/worktrees`               | Créer worktree + branche                       |
| DELETE  | `/api/git/worktrees`               | Supprimer worktree (optionnel: + branche)      |
| GET     | `/api/git/repo-name`               | Nom du repo                                    |
| GET     | `/api/git/generate-branch-name`    | Générer nom de branche                         |

### Filesystem
| Méthode    | Route                            | Description                          |
| ---------- | -------------------------------- | ------------------------------------ |
| GET/PUT/DEL| `/api/filesystem/agents`         | CRUD fichiers agents (.md)           |
| GET/PUT/DEL| `/api/filesystem/skills`         | CRUD fichiers skills (.md)           |
| GET        | `/api/filesystem/pick-directory` | Directory picker                     |

---

## Composants (30 fichiers)

### Layout (`src/components/layout/`)

| Composant            | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `AppShell.tsx`       | Root layout client, gère RightSidebar/OverlayTerminal contexts, splash    |
| `Sidebar.tsx`        | Drawer 220px, navigation, badge todos, avatar user, logout                |
| `Header.tsx`         | AppBar 64px, theme toggle, agents panel toggle, session counter           |
| `RightSidebar.tsx`   | Drawer 400px resizable, worktrees par agent view, sessions actives/passées|
| `OverlayTerminal.tsx`| Terminal flottant draggable/expandable, xterm.js, WebSocket port 4001     |
| `AppLoadingSplash.tsx`| Splash animé pendant init session                                        |

### Dashboard (`src/components/dashboard/`)

| Composant               | Description                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| `Dashboard.tsx`          | Hub central : sessions actives/passées, SummaryTimeline          |
| `IssueCard.tsx`          | Card issue : title, repo, labels, status, assignee, lien détail |
| `IssueDetail.tsx`        | Issue complète : markdown editable, commentaires, timeline, agent|
| `IssueTimelineModal.tsx` | Modal timeline historique issue                                  |

### Agents (`src/components/agents/`)

| Composant                | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `AgentsList.tsx`         | Grille agents avec preview markdown, edit/delete/launch                 |
| `AgentTerminalModal.tsx` | Modal 1400×90vh : Step 1 (branche) → Step 2 (terminal, activity, diff, shell, issue)|
| `AgentEditorDialog.tsx`  | Éditeur contenu prompt agent                                           |
| `AgentFormDialog.tsx`    | Formulaire création preset (name, description, prompt, icon, color)     |
| `AgentActivityTab.tsx`   | Logs activité avec timeline, bouton publish-to-GitHub                   |
| `AgentDiffTab.tsx`       | Viewer diff Git side-by-side avec stats additions/deletions             |
| `AgentIssueTab.tsx`      | Viewer issue compact dans modal agent                                   |
| `AgentBuilderDialog.tsx` | Wizard 4 étapes : task type → tech stack → conventions → preview        |

### Issues (`src/components/issues/`)

| Composant              | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `IssuesList.tsx`       | Kanban board GitHub issues par colonnes Project V2, recherche  |
| `KanbanColumn.tsx`     | Colonne kanban 300px avec header count                         |
| `CreateBranchModal.tsx`| Modal création branche Git au passage "In Progress"            |

### Autres features

| Composant               | Dossier      | Description                                                   |
| ------------------------ | ------------ | ------------------------------------------------------------- |
| `PullRequestsList.tsx`   | `prs/`       | Liste PRs, couleur âge, checks CI, merge avec confirmation    |
| `TodoList.tsx`           | `todos/`     | Tabs accordion, checkbox, édition inline, suggestions issues  |
| `SkillsList.tsx`         | `skills/`    | Grille skills .md                                             |
| `SkillEditorDialog.tsx`  | `skills/`    | Éditeur contenu skill                                         |
| `WorkspaceView.tsx`      | `workspace/` | Worktrees/branches actifs                                     |
| `BranchDetail.tsx`       | `workspace/` | Détail branche                                                |
| `SettingsPanel.tsx`      | `settings/`  | Config Project V2 + repo paths                                |

### Shared (`src/components/shared/`)

| Composant          | Description                                                          |
| ------------------ | -------------------------------------------------------------------- |
| `DraggableTabs.tsx`| Tabs drag-and-drop générique, badges count, couleur configurable     |
| `SessionCard.tsx`  | Card session/worktree réutilisable : status badges, animations, context menu |

### Providers (root `src/components/`)

| Composant          | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `AuthProvider.tsx`  | NextAuth SessionProvider wrapper                          |
| `QueryProvider.tsx` | React Query client init (staleTime 5min) + SnackbarProvider|
| `ThemeRegistry.tsx` | MUI ThemeProvider + ColorModeProvider                     |
| `LocaleSwitcher.tsx`| Sélecteur langue (5 locales) via next-intl                |

---

## Hooks (20 fichiers)

### Données GitHub

| Hook                    | Fichier                  | Description                                                    |
| ----------------------- | ------------------------ | -------------------------------------------------------------- |
| `useGitHub`             | `useGitHub.ts`           | Dashboard data (user, repos, issues enrichies Project V2)      |
| `useIssue`              | (dans useGitHub)         | Issue unique + commentaires                                    |
| `useIssueTimeline`      | (dans useGitHub)         | Timeline events issue                                          |
| `usePullRequests`       | `usePullRequests.ts`     | PRs par repos + mutation merge (squash support)                |
| `useUpdateIssueStatus`  | `useUpdateIssueStatus.ts`| Mutation status issue GraphQL, optimistic update               |
| `useProjectConfig`      | `useProjectConfig.ts`    | CRUD config Project V2, syncViews(), viewRepoMappings          |

### Agents & Sessions

| Hook                     | Fichier                     | Description                                                  |
| ------------------------ | --------------------------- | ------------------------------------------------------------ |
| `useAgentSession`        | `useAgentSession.ts`        | Session unique : ensureSession, addLog, updateStatus, polling 10s|
| `useSessionManager`      | `useSessionManager.ts`      | Agrège actives (tmux 5s) + past (DB), kill/delete/getForPath |
| `useActiveSessions`      | `useActiveSessions.ts`      | Sessions tmux actives, polling 5s                            |
| `useAgentFiles`          | `useAgentFiles.ts`          | CRUD agents .md via `/api/filesystem/agents`                 |
| `useSkillFiles`          | `useSkillFiles.ts`          | CRUD skills .md via `/api/filesystem/skills`                 |
| `useAgentViews`          | `useAgentViews.ts`          | Agent views (label, path, repo), reordering, addView()       |
| `useRecentLogs`          | `useRecentLogs.ts`          | Summaries agents agrégés, parsing logs, polling 15s          |

### Todos

| Hook                  | Fichier                | Description                                                 |
| --------------------- | ---------------------- | ----------------------------------------------------------- |
| `useTodos`            | `useTodos.ts`          | CRUD complet par repo, mutations optimistes, lien issues    |
| `usePendingTodoCount` | `usePendingTodoCount.ts`| Count non-faits, polling 30s                               |

### Git & Worktrees

| Hook            | Fichier            | Description                                              |
| --------------- | ------------------ | -------------------------------------------------------- |
| `useWorktrees`  | `useWorktrees.ts`  | List/create/delete worktrees, cwd-specific, staleTime 30s|
| `useBranches`   | `useBranches.ts`   | Branches + metadata (lastCommitDate, author, isCurrent)  |
| `useRepoPaths`  | `useRepoPaths.ts`  | Map repo_full_name ↔ local_path (SQLite), getLocalPath()  |

### UI State

| Hook               | Fichier              | Description                                           |
| ------------------ | -------------------- | ----------------------------------------------------- |
| `useTabOrder`      | `useTabOrder.ts`     | Persistance ordre tabs en SQLite, applyOrder()        |
| `useRightSidebar`  | `useRightSidebar.ts` | Context RightSidebar (open, toggle, width)            |
| `useSnackbar`      | `useSnackbar.tsx`    | Context Provider snackbars, showSnackbar()            |
| `useColorMode`     | `useColorMode.tsx`   | Context dark/light, persisté localStorage             |
| `useOverlayTerminal`| `useOverlayTerminal.ts`| State terminal flottant                             |

---

## Services (`src/lib/`)

| Fichier              | Description                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| `github.ts` (24 KB)  | REST + GraphQL GitHub : fetch user/repos/issues/PRs/projects, mutations  |
| `auth-utils.ts`      | `getAuthContext()`, `requireAuth()` — NextAuth session parsing           |
| `api-fetch.ts`       | `apiFetch()` — wrapper fetch avec détection 401 → logout                |
| `local-fetch.ts`     | `localFetch()` — appelle le serveur agent (:4001), fallback API Next en dev, WS url helpers |
| `projectViews.ts`    | `parseViewFilter()`, `mapViewsToRepos()` — helpers Project V2           |
| `locale.ts`          | Server action `setLocale()` — persistance cookie                        |

> Le WebSocket/terminal server vit désormais dans `packages/agent/` (serveur `devora-agent` autonome sur le port 4001), plus dans `src/lib/`. Il accède au SQLite partagé via `packages/agent/src/db.ts`.

---

## Theme & Design

### Palette dark mode (défaut)

| Rôle               | Couleur            |
| ------------------ | ------------------ |
| Primary            | `#7C5CFF` (violet) |
| Secondary          | `#00D4FF` (cyan)   |
| Background default | `#1A1A1A`          |
| Background paper   | `#222222`          |
| Text primary       | `#FFFFFF`          |
| Text secondary     | `#B3B3B3`          |
| Divider            | `#3A3A3A`          |
| Success            | `#22C55E`          |
| Error              | `#EF4444`          |
| Warning            | `#F59E0B`          |

### Palette light mode

| Rôle               | Couleur            |
| ------------------ | ------------------ |
| Primary            | `#8B7EC8`          |
| Secondary          | `#7A9E8E`          |
| Background default | `#F5F1EB`          |
| Background paper   | `#FDFBF8`          |

### Conventions UI

- Font : Poppins, fontSize base 12px, custom h4/h5/h6
- Cards : borders subtiles, hover transform, borderRadius 10px
- Chips : fontWeight/fontSize custom
- Tabs : no textTransform, minHeight 40px
- Dialogs, Drawers, AppBar : overrides custom dans theme
- Animations : Framer Motion pour transitions, CSS keyframes pour entrées
- Default borderRadius : 8px

---

## i18n (Internationalisation)

- **Lib** : next-intl 4.8 avec `NextIntlClientProvider`
- **Locales** : `en`, `fr`, `es`, `de`, `pt` (détection cookie, fallback `en`)
- **Fichiers** : `src/config/translate/{locale}.json`
- **Persistance** : server action `setLocale()` → cookie
- **Clés principales** : `sidebar`, `landing`, `dashboard`, `issues`, `prs`, `agents`, `skills`, `todos`, `workspace`, `settings`, `header`, `common`, `agentBuilder`, `agentForm`, `agentActivity`, `agentDiff`, `agentIssue`, `sessionCard`, `issueDetail`
- **Plurals** : support ICU (`{count, plural, one {# agent} other {# agents}}`)

---

## Types principaux (`src/types/index.ts`)

```typescript
// GitHub
GitHubRepo, GitHubLabel, GitHubIssue, GitHubComment, GitHubPullRequest
GitHubTimelineEvent, DashboardData, DashboardStats, CheckRun, ProjectColumn

// Project V2
ProjectV2Config, ProjectV2Data, ProjectV2View, ProjectV2Item
ViewRepoMapping, ViewIssueRef, StatusFieldInfo

// Agents
AgentPreset { id, name, description, prompt_template, icon, color, created_at }
AgentSession { id, session_id, project_path, project_name, branch, agent_name, status }
AgentActivityLog { id, agent_session_id, content, log_type, branch, status, created_at }

// Todos
Todo { id, repo_full_name, title, description, done, sort_order, issueNumber?, issueRepo? }
```

---

## Règles de travail

### Git

- **Ne jamais commiter sans accord explicite** de Ludovic
- Workflow : feature branches + PR
- Nommer les branches : `feat/`, `fix/`, `refactor/`

### Code

- Respecter les patterns existants avant d'en introduire de nouveaux
- Pas de sur-ingénierie : faire simple, faire propre
- Pas de commentaires inutiles, pas de docstrings sur du code évident
- `"use client"` sur tous les composants interactifs
- Types centralisés dans `src/types/index.ts`
- Path alias : `@/*` → `./src/*`
- **Jamais de texte en dur** dans les composants — toujours utiliser `next-intl` (`useTranslations`) pour tous les labels, messages, boutons, etc. Les traductions sont dans `src/config/translate/`

### Naming

- Composants : PascalCase, organisés par feature
- Hooks : `use*` prefix
- Types : PascalCase
- API routes : kebab-case
- Fichiers composants : PascalCase (ex: `AgentTerminalModal.tsx`)

### IDE

- Ludovic utilise **Cursor** comme IDE principal
- Port de dev : **4000**

### Env vars requises

> Plus aucune variable Supabase. La DB SQLite est locale (`data/devora.db`, créée au runtime). Noms vérifiés dans le code (`src/auth.ts`, `src/lib/*`).

- `AUTH_SECRET` — Secret NextAuth (lu automatiquement par authjs). Générer : `openssl rand -base64 33`
- `GITHUB_CLIENT_ID` — GitHub OAuth App ID
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App Secret
- `GITHUB_TOKEN` — Token GitHub (REST + GraphQL, fallback)
- `ALLOWED_GITHUB_USERS` — (optionnel) whitelist de logins séparés par virgule
- `NEXT_PUBLIC_APP_URL` — (optionnel) URL publique de l'app
- `NEXT_PUBLIC_AGENT_URL` — (optionnel) URL du serveur agent, défaut `http://localhost:4001`
- `DEVORA_DB_PATH` — (optionnel) chemin absolu de la DB, injecté auto par `scripts/dev-auto-port.mjs` pour que l'app Next et l'agent partagent le même fichier
