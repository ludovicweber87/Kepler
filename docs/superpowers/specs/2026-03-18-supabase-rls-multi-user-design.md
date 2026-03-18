# Supabase RLS Multi-User — Design Spec

**Date:** 2026-03-18
**Status:** Approved

## Problem

All Supabase RLS policies are `Allow ALL` with `qual = true`. Any user can read and modify any other user's data. The Supabase client uses the anon key without auth context, so `auth.uid()` returns null.

## Solution

Mint a custom Supabase JWT server-side (using the NextAuth user ID) and use it to create authenticated Supabase clients. Replace all RLS policies with `auth.uid() = user_id` filters.

## Architecture

### Auth Flow

1. User logs in via NextAuth (GitHub OAuth) — unchanged
2. Client calls `POST /api/supabase-token` (protected by NextAuth)
3. Server mints a JWT signed with `SUPABASE_JWT_SECRET`, payload: `{ sub: userId, role: 'authenticated', aud: 'authenticated', exp: +1h }`
4. Client creates a Supabase client with this JWT
5. All queries go through RLS with `auth.uid()` = userId

### New Files

#### `src/lib/supabase-jwt.ts`

Server-only helper. Uses `jsonwebtoken` to sign a JWT with `SUPABASE_JWT_SECRET`.

```typescript
function mintSupabaseToken(userId: string): { token: string; expiresAt: number }
```

#### `POST /api/supabase-token`

Protected by `requireAuth()`. Returns `{ token, expiresAt }`.

#### `src/hooks/useSupabase.ts` + `SupabaseProvider`

React context that:
- Calls `/api/supabase-token` after NextAuth session is available
- Creates an authenticated Supabase client
- Auto-refreshes token before expiration
- Exposes `{ supabase, isReady }`

### Modified Files

#### `src/lib/supabase.ts`

- Keep anon client renamed for non-auth cases
- Add `createSupabaseClient(token: string)` factory
- Add `supabaseServiceRole` client using `SUPABASE_SERVICE_ROLE_KEY` (server-only)

#### Hooks (10 files)

All hooks that import `supabase` from `@/lib/supabase` switch to `useSupabase()` context:

- `useTodos.ts`
- `useProjectConfig.ts`
- `useRepoPaths.ts`
- `useTabOrder.ts`
- `useAgentSession.ts`
- `useRecentLogs.ts`
- `useDashboardTodos.ts`
- `usePendingTodoCount.ts`
- `usePendingQuestions.ts`
- `useSessionManager.ts`

Existing `.eq('user_id', userId)` filters can remain as defense-in-depth. `insert` calls must still include `user_id` (RLS validates but does not auto-set).

#### API Routes (3 files)

- `agent-sessions/log/route.ts` — non-auth route called by Claude CLI. Uses `supabaseServiceRole` (bypasses RLS).
- `agent-sessions/[sessionId]/kill/route.ts` — uses service role or minted token.
- `agent-sessions/[sessionId]/auto-summary/route.ts` — uses service role or minted token.

#### Layout

`SupabaseProvider` added to the provider tree in `QueryProvider.tsx` or root layout, wrapping components that need Supabase access.

### Database Migrations

#### 1. Add `user_id` to `agent_activity_logs`

```sql
ALTER TABLE agent_activity_logs ADD COLUMN user_id text;
```

Backfill existing rows from parent session:

```sql
UPDATE agent_activity_logs al
SET user_id = s.user_id
FROM agent_sessions s
WHERE al.agent_session_id = s.id AND al.user_id IS NULL;
```

#### 2. Replace RLS Policies

Drop all existing `Allow all` policies and create per-table CRUD policies.

Tables: `todos`, `agent_sessions`, `agent_activity_logs`, `agent_presets`, `project_configs`, `repo_paths`, `tab_orders`, `notifications`

Pattern per table:

```sql
DROP POLICY "Allow all on <table>" ON <table>;

CREATE POLICY "Users can select own data" ON <table>
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own data" ON <table>
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own data" ON <table>
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own data" ON <table>
  FOR DELETE USING (auth.uid()::text = user_id);
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `SUPABASE_JWT_SECRET` | Sign custom JWTs (from Supabase Dashboard → Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side client that bypasses RLS |

### Dependencies

- `jsonwebtoken` + `@types/jsonwebtoken`

### Special Cases

- **`/api/agent-sessions/log`**: Non-auth endpoint called by Claude CLI. Uses service role key. Must set `user_id` on `agent_activity_logs` inserts by looking up the parent `agent_sessions` row.
- **Token refresh**: `useSupabase` hook re-fetches token before expiration (e.g., at 50min mark for 1h tokens).

## What Does Not Change

- NextAuth configuration and GitHub OAuth flow
- GitHub API calls (use user's GitHub token, already isolated)
- React components (none call Supabase directly)
- Terminal/WebSocket system (local per user)
- Middleware (`src/middleware.ts`)

## Implementation Order

1. Add env vars (`SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`)
2. Install `jsonwebtoken` + types
3. Create `src/lib/supabase-jwt.ts`
4. Create `POST /api/supabase-token`
5. Update `src/lib/supabase.ts` (add factory + service role client)
6. Create `src/hooks/useSupabase.ts` + `SupabaseProvider`
7. Run DB migrations (add column + replace policies)
8. Adapt hooks (10 files)
9. Adapt API routes (3 files)
10. Wire `SupabaseProvider` into layout
