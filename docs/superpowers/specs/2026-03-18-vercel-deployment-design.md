# Devora — Vercel Deployment + Local Agent

**Date:** 2026-03-18
**Status:** Approved

## Objectif

Déployer le frontend Devora sur Vercel (URL publique) tout en gardant les opérations locales (terminal, git, Claude CLI, filesystem) sur la machine de chaque user via un agent local lancé avec `npx devora-agent`.

## Architecture

```
┌─────────── Vercel ───────────┐     ┌──── Machine user ────┐
│  Next.js frontend            │     │  devora-agent         │
│  API: auth, supabase-token,  │     │  HTTP + WS :4001      │
│       github/*, agent-log    │     │  Claude CLI, git,     │
│                              │     │  tmux, filesystem     │
│  Browser ────────────────────┼────►│                       │
└──────────────────────────────┘     └───────────────────────┘
```

- **Vercel** sert le frontend + les routes API qui parlent à Supabase/GitHub
- **Local agent** (`npx devora-agent`) tourne chez chaque user pour terminal/git/Claude CLI/filesystem
- **Un seul projet Supabase** partagé, protégé par RLS multi-user (auth.uid() = user_id)
- **Une seule GitHub OAuth App** partagée, callback vers l'URL Vercel

## Split des routes

### Restent sur Vercel (Next.js API routes)

| Route | Raison |
|-------|--------|
| `/api/auth/[...nextauth]` | OAuth callback public |
| `/api/supabase-token` | Mint JWT serveur |
| `/api/github/*` (tous) | Proxy GitHub API |
| `/api/agent-sessions/log` | Reçoit logs agents (service role) |

### Migrent vers l'agent local

| Route | Raison |
|-------|--------|
| `/api/git/*` (8 routes) | execSync git, filesystem |
| `/api/sessions` | Liste tmux actives |
| `/api/agent-sessions/[id]/kill` | Kill tmux |
| `/api/agent-sessions/[id]/auto-summary` | Spawn Claude CLI |
| `/api/chat` | Spawn Claude CLI (SSE) |
| `/api/agent-builder` | Spawn Claude CLI (SSE) |
| `/api/filesystem/*` (3 routes) | CRUD fichiers locaux |

## Agent local

### Serveur

- HTTP REST + WebSocket sur `localhost:4001` (même port, upgrade HTTP→WS pour le terminal)
- Pas de framework lourd — serveur HTTP Node.js natif ou fastify
- CORS configuré pour accepter le domaine Vercel (`DEVORA_WEB_URL`)
- Pas d'auth sur l'agent — localhost only

### Structure

```
packages/agent/
├── src/
│   ├── index.ts          # Entry point, démarre HTTP + WS
│   ├── routes/
│   │   ├── git.ts        # branch, branches, diff, push, worktrees, repo-name, etc.
│   │   ├── sessions.ts   # Liste tmux actives, kill, auto-summary
│   │   ├── chat.ts       # Claude CLI streaming (SSE)
│   │   ├── agent-builder.ts
│   │   └── filesystem.ts # Agents/skills CRUD, pick-directory
│   └── terminal.ts       # WebSocket terminal (migré depuis terminal-server.ts)
├── package.json
└── tsconfig.json
```

### Tokens et auth

- **Zéro config pour l'user** — pas de tokens à set manuellement
- Le token GitHub arrive du frontend via header `Authorization: Bearer <token>` à chaque requête
- Claude CLI utilise la config locale existante (`claude login` fait une fois au préalable)
- L'agent local n'a pas besoin de `.env`

### Prérequis user

- Node.js 18+
- Claude CLI installé et loggé
- Git + tmux installés

### Output au lancement

```
✓ Devora Agent running on http://localhost:4001
✓ Claude CLI detected
✓ Git detected
✓ tmux detected

Open https://devora.vercel.app to start
```

## Frontend — routing des appels

### `localFetch`

Wrapper équivalent à `apiFetch` mais ciblant localhost :

```typescript
// src/lib/local-fetch.ts
const AGENT_URL = 'http://localhost:4001';

export async function localFetch(path: string, options?: RequestInit) {
  const session = await getSession();
  return fetch(`${AGENT_URL}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${session?.accessToken}`,
    },
  });
}
```

### Mapping des appels

- `apiFetch('/api/github/...')` → inchangé (Vercel)
- `apiFetch('/api/git/...')` → `localFetch('/git/...')`
- `apiFetch('/api/chat')` → `localFetch('/chat')`
- `apiFetch('/api/filesystem/...')` → `localFetch('/filesystem/...')`
- WebSocket `ws://localhost:4001` → `ws://localhost:4001/ws`

### Détection agent local

- Hook `useAgentStatus` — ping `localhost:4001/health` au démarrage
- Context provider `AgentStatusProvider` expose `isAgentConnected`
- Si agent non détecté : bandeau "Agent local non détecté — lancez `npx devora-agent`"
- Features locales désactivées gracieusement (boutons grisés, tooltips explicatifs)

## Changements à faire

### 1. Créer `packages/agent/`

- Extraire `terminal-server.ts` → `packages/agent/src/terminal.ts`
- Migrer les 14 routes locales vers `packages/agent/src/routes/`
- Point d'entrée HTTP + WS sur port 4001
- CORS pour le domaine Vercel

### 2. Modifier le frontend

- Créer `src/lib/local-fetch.ts`
- Mettre à jour les hooks appelant les routes locales
- Ajouter `useAgentStatus` hook + `AgentStatusProvider`
- Afficher bandeau "agent non connecté"
- Retirer `instrumentation.ts` (terminal server ne démarre plus avec Next.js)

### 3. Config Vercel

- `vercel.json` minimal
- Variables d'env : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET`
- `AUTH_URL` → URL Vercel
- GitHub OAuth App callback URL → URL Vercel

### 4. Monorepo

```
devora/
├── src/                  # Next.js app (déployé sur Vercel)
├── packages/
│   └── agent/            # Local agent (publié sur npm)
├── package.json          # Workspace root
└── vercel.json
```

### 5. Inchangé

- Supabase (même projet, RLS multi-user en place)
- Dépendances `node-pty` et `ws` (restent, ignorées par Vercel)
- NextAuth (juste `AUTH_URL` à mettre à jour)

## Distribution

- Package npm `devora-agent`
- Usage : `npx devora-agent`
- Aucune configuration requise côté user
