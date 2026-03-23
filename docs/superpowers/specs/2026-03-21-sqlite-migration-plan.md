# SQLite Migration — Implementation Plan

## Architecture Change

**Before:** Client hooks → Supabase client (direct DB from browser via JWT)
**After:** Client hooks → API routes → SQLite (server-side only)

This aligns all data access with the existing GitHub pattern: `hook → apiFetch → API route → data source`.

---

## Phase 1 — Setup (foundation)

### 1.1 Install dependencies
```bash
yarn add drizzle-orm better-sqlite3
yarn add -D drizzle-kit @types/better-sqlite3
```

### 1.2 Gitignore
Add `data/` to `.gitignore`

### 1.3 Drizzle config
Create `drizzle.config.ts` at project root.

### 1.4 Schema
Create `src/db/schema.ts` — 6 tables matching current Supabase structure (minus user_id):
- `todos`
- `agent_sessions`
- `agent_activity_logs`
- `repo_paths`
- `project_configs`
- `tab_orders`

### 1.5 DB init
Create `src/db/index.ts`:
- Init better-sqlite3 pointing to `./data/devora.db`
- Auto-create `data/` directory if missing
- Enable WAL mode
- Run migrations on first import
- Export `db` Drizzle instance

### 1.6 Generate initial migration
Run `drizzle-kit generate`

---

## Phase 2 — API Routes for data (new endpoints)

Create REST API routes that replace direct Supabase access. Each route uses `db` from `src/db/index.ts`.

### 2.1 Todos API — `/api/todos`
| Method | Route | Description | Used by |
|--------|-------|-------------|---------|
| GET | `/api/todos` | List todos (optional `?repo=...`, `?limit=8`, `?countOnly=true`) | useTodos, usePendingTodoCount, useDashboardTodos |
| POST | `/api/todos` | Create todo | useTodos |
| PATCH | `/api/todos` | Update todo (toggle, edit, reorder, link/unlink issue) | useTodos, IssueDetail |
| DELETE | `/api/todos` | Delete todo by id | useTodos |
| POST | `/api/todos/complete-issue` | Mark all todos for an issue as done | IssuesList, IssueDetail |

### 2.2 Agent Sessions API — `/api/agent-sessions`
| Method | Route | Description | Used by |
|--------|-------|-------------|---------|
| GET | `/api/agent-sessions` | List sessions (`?status=active`, `?status=completed`, `?branch=...`, `?limit=50`) | useAgentSession, useRecentLogs, usePendingQuestions, useSessionManager, BranchDetail |
| POST | `/api/agent-sessions` | Create/ensure session | useAgentSession |
| PATCH | `/api/agent-sessions` | Update session (status, agent_name, branch, report_published_at) | useAgentSession, AgentActivityTab |
| DELETE | `/api/agent-sessions` | Delete session + its logs | useSessionManager |

### 2.3 Agent Activity Logs — `/api/agent-sessions/logs`
| Method | Route | Description | Used by |
|--------|-------|-------------|---------|
| GET | `/api/agent-sessions/logs` | Get logs for a session (`?sessionId=...`) | useAgentSession, useRecentLogs, usePendingQuestions |
| POST | `/api/agent-sessions/logs` | Add log entry | useAgentSession |

**Note:** `/api/agent-sessions/log` (existing, non-auth) stays but rewrites to use SQLite instead of Supabase service role client.

### 2.4 Repo Paths — `/api/repo-paths`
| Method | Route | Description | Used by |
|--------|-------|-------------|---------|
| GET | `/api/repo-paths` | List all repo paths | useRepoPaths |
| PUT | `/api/repo-paths` | Upsert repo path | useRepoPaths |
| DELETE | `/api/repo-paths` | Delete repo path | useRepoPaths |

### 2.5 Project Configs — `/api/project-configs`
| Method | Route | Description | Used by |
|--------|-------|-------------|---------|
| GET | `/api/project-configs` | List all configs | useProjectConfig |
| PUT | `/api/project-configs` | Upsert config | useProjectConfig |
| DELETE | `/api/project-configs` | Delete config (`?id=...` or `?all=true`) | useProjectConfig |

### 2.6 Tab Orders — `/api/tab-orders`
| Method | Route | Description | Used by |
|--------|-------|-------------|---------|
| GET | `/api/tab-orders` | Get order by group_key | useTabOrder |
| PUT | `/api/tab-orders` | Upsert order | useTabOrder |

---

## Phase 3 — Migrate hooks

Rewrite each hook to use `apiFetch()` instead of `useSupabase()`. The React Query structure stays identical — only the fetch functions change.

### 3.1 `useTodos.ts`
- Replace all `supabase.from('todos').*` with `apiFetch('/api/todos', ...)`
- Remove `useSupabase()` import
- Move `completeIssueTodos` to call `/api/todos/complete-issue`

### 3.2 `usePendingTodoCount.ts`
- Replace COUNT query with `apiFetch('/api/todos?countOnly=true&done=false')`

### 3.3 `useDashboardTodos.ts`
- Replace SELECT with `apiFetch('/api/todos?limit=8')`

### 3.4 `useAgentSession.ts`
- Replace session CRUD with `/api/agent-sessions` calls
- Replace log INSERT/SELECT with `/api/agent-sessions/logs` calls

### 3.5 `useRecentLogs.ts`
- Replace complex query (sessions + logs join) with `/api/agent-sessions?status=completed&limit=50&withLogs=true`

### 3.6 `usePendingQuestions.ts`
- Replace query with `/api/agent-sessions?status=active&withLastLog=true`

### 3.7 `useSessionManager.ts`
- Replace DELETE + SELECT with `/api/agent-sessions` calls

### 3.8 `useProjectConfig.ts`
- Replace all CRUD with `/api/project-configs` calls

### 3.9 `useTabOrder.ts`
- Replace SELECT/UPSERT with `/api/tab-orders` calls

### 3.10 `useRepoPaths.ts`
- Replace all CRUD with `/api/repo-paths` calls

---

## Phase 4 — Migrate components with direct Supabase access

### 4.1 `AgentActivityTab.tsx`
- Replace `supabase.from('agent_sessions').update(...)` with `apiFetch('/api/agent-sessions', { method: 'PATCH', ... })`

### 4.2 `IssueDetail.tsx`
- Replace todo update queries with `apiFetch('/api/todos', { method: 'PATCH', ... })`

### 4.3 `BranchDetail.tsx`
- Replace local `useBranchSessions` hook with `apiFetch('/api/agent-sessions?branch=...')`

### 4.4 `IssuesList.tsx`
- `completeIssueTodos` already refactored in Phase 3.1

---

## Phase 5 — Migrate existing API routes

### 5.1 `/api/agent-sessions/log/route.ts`
- Replace `createServiceRoleClient()` with `db` import from `src/db/index.ts`
- Same logic, Drizzle queries instead of Supabase

### 5.2 `/api/agent-sessions/[sessionId]/kill/route.ts`
- Replace Supabase UPDATE with Drizzle UPDATE

### 5.3 `/api/agent-sessions/[sessionId]/auto-summary/route.ts`
- Replace Supabase SELECT with Drizzle SELECT

### 5.4 `/api/github/issue/move-status/route.ts`
- Replace `createServiceRoleClient()` config query with Drizzle SELECT on `project_configs`

---

## Phase 6 — Cleanup

### 6.1 Delete files
- `src/lib/supabase.ts`
- `src/lib/supabase-jwt.ts`
- `src/hooks/useSupabase.tsx`
- `src/app/api/supabase-token/route.ts`

### 6.2 Update QueryProvider.tsx
- Remove `<SupabaseProvider>` wrapper

### 6.3 Remove dependencies
- `yarn remove @supabase/supabase-js`

### 6.4 Remove env vars
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

### 6.5 Update CLAUDE.md
- Stack table: Supabase → SQLite (Drizzle ORM + better-sqlite3)
- Remove Supabase env vars from required list
- Update data flow diagram
- Update state management table

---

## Execution Order

The phases are sequential but within each phase, files can be worked on independently:

1. **Phase 1** — Foundation (must be first, everything depends on it)
2. **Phase 2** — API routes (can be built and tested independently per table)
3. **Phase 3 + 4** — Hooks + components (per feature: todos, sessions, configs...)
4. **Phase 5** — Existing API routes (independent per route)
5. **Phase 6** — Cleanup (must be last, verify nothing imports Supabase)

Within Phase 2-4, the recommended order by feature (to test incrementally):
1. **Todos** (simplest, good first test)
2. **Repo Paths** (simple CRUD)
3. **Tab Orders** (simple CRUD)
4. **Project Configs** (CRUD + JSON)
5. **Agent Sessions + Logs** (most complex, multiple hooks + components)
