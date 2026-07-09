# Chat SDK style Messenger (lot 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'onglet « Claude » (terminal xterm) de `AgentTerminalModal` par un chat structuré style Messenger branché sur le protocole WebSocket SDK du lot 1, avec barre de contrôle (model/effort/mode), permissions inline, transcript persisté et logs d'activité dérivés des events.

**Architecture:** Le frontend consomme le protocole WS lot 1 via un hook unique (`useAgentChat`) qui réduit les `stream-event` en `ChatMessage[]` (réducteur pur, dédup par `seq`). Le serveur agent gagne la persistance du transcript (`agent_chat_messages`), la numérotation `seq`, le resume owné serveur (`claude_session_id`), et la dérivation des logs d'activité. Composants MUI purement présentationnels.

**Tech Stack:** Next 16 / React 19 / TypeScript 5 / MUI 7 / next-intl / react-markdown / Vitest (nouveau, frontend) / node:test (existant, `packages/agent`) / Drizzle + better-sqlite3.

## Global Constraints

- **Communication** : tout label/message UI passe par `next-intl` (`useTranslations`) — jamais de texte en dur. Nouvelle clé racine `agentChat` dans les 5 locales (`en, fr, es, de, pt`).
- **Types centralisés** dans `src/types/index.ts`. Path alias `@/*` → `./src/*`.
- **`"use client"`** en tête de tout composant/hook interactif.
- **Le serveur agent ne joue PAS les migrations** (propriété app Next) ; il lit/écrit en raw SQL via `getDb()` qui peut renvoyer `null` → dégrader en no-op.
- **Auth SDK** : ne jamais réintroduire `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL` dans l'env (lot 1 `cleanEnv()`).
- **Valeurs de contrôle** (constantes UI) :
  - Model → alias SDK : `opus` (Opus 4.8), `sonnet` (Sonnet 5), `haiku` (Haiku 4.5).
  - Effort : `low | medium | high | max`.
  - PermissionMode (UI) : `plan | acceptEdits | bypassPermissions`.
- **Commits fréquents**, un par tâche minimum. Ne jamais commiter sans que les tests de la tâche passent.
- **Branche de travail** : `feat/agent-chat-lot2` (créer avant Task 0 si pas déjà en worktree isolé).

---

## File Structure

**Frontend (`src/`)**
- `vitest.config.ts`, `vitest.setup.ts` — **créés** (Task 0)
- `src/types/index.ts` — **modifié** : types chat (Task 5)
- `src/lib/chatReducer.ts` (+ `.test.ts`) — **créé** : `reduceStreamEvent` pur (Task 5)
- `src/hooks/useAgentChat.ts` (+ `.test.ts`) — **créé** : machine à états WS (Task 6)
- `src/components/agents/chat/ChatBubble.tsx` — **créé** (Task 7)
- `src/components/agents/chat/ChatThinking.tsx` — **créé** (Task 7)
- `src/components/agents/chat/ChatToolCard.tsx` — **créé** (Task 7)
- `src/components/agents/chat/ChatPermissionCard.tsx` — **créé** (Task 7)
- `src/components/agents/chat/ChatComposer.tsx` — **créé** (Task 8)
- `src/components/agents/AgentChatTab.tsx` — **créé** (Task 9)
- `src/components/agents/AgentTerminalModal.tsx` — **modifié** : intégration + retrait code mort + PiP + tab visibility (Task 10)
- `src/config/translate/{en,fr,es,de,pt}.json` — **modifiés** : namespace `agentChat` (Task 7)

**Backend (`packages/agent/src/`)**
- `sdk/transcriptStore.ts` (+ `.test.ts`) — **créé** (Task 2)
- `sdk/activityDeriver.ts` (+ `.test.ts`) — **créé** (Task 3)
- `sdk/sdkAgent.ts` — **modifié** : seq, persistance, stream-history, derive, resume DB (Task 4)

**DB (`src/db/`)**
- `schema.ts` — **modifié** : table `agent_chat_messages` + colonne `claude_session_id` (Task 1)
- `migrations/00XX_*.sql` — **généré** par drizzle-kit (Task 1)

---

## Task 0: Setup Vitest (frontend)

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (scripts + devDependencies)

**Interfaces:**
- Produces: commande `npm run test:web` qui exécute les `*.test.ts(x)` sous `src/` en environnement jsdom, avec `@/` résolu.

- [ ] **Step 1: Installer les devDeps**

```bash
npm i -D vitest@^3 @vitejs/plugin-react@^4 jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```

- [ ] **Step 2: Créer `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
```

- [ ] **Step 3: Créer `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Ajouter les scripts dans `package.json`**

Dans `"scripts"`, ajouter :
```json
"test:web": "vitest run",
"test:web:watch": "vitest"
```

- [ ] **Step 5: Test de fumée**

Créer `src/lib/__smoke__.test.ts` :
```ts
import { test, expect } from 'vitest';
test('vitest fonctionne', () => { expect(1 + 1).toBe(2); });
```

Run: `npm run test:web`
Expected: 1 passed.

- [ ] **Step 6: Supprimer le smoke test et commit**

```bash
rm src/lib/__smoke__.test.ts
git add vitest.config.ts vitest.setup.ts package.json package-lock.json
git commit -m "chore(test): setup vitest for frontend"
```

---

## Task 1: DB — table transcript + colonne resume

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/00XX_*.sql` (généré)

**Interfaces:**
- Produces: table `agent_chat_messages { id, agent_session_id, seq, role, event_type, content(json), created_at }` ; colonne `agent_sessions.claude_session_id TEXT`.

- [ ] **Step 1: Étendre `agentSessions` dans `src/db/schema.ts`**

Dans la définition de `agentSessions` (après `issue_title: text(),`), ajouter :
```ts
	claude_session_id: text(),
```

- [ ] **Step 2: Ajouter la table `agentChatMessages` dans `src/db/schema.ts`**

Après le bloc `agentActivityLogs`, ajouter :
```ts
// ─── Agent Chat Messages (transcript SDK) ────────────────

export const agentChatMessages = sqliteTable('agent_chat_messages', {
	id: uuid(),
	agent_session_id: text().notNull(),
	seq: integer().notNull(),
	role: text().notNull(),
	event_type: text().notNull(),
	content: text({ mode: 'json' }),
	created_at: timestamp(),
});
```

- [ ] **Step 3: Générer la migration**

Run: `npx drizzle-kit generate`
Expected: un nouveau fichier `src/db/migrations/00XX_*.sql` contenant `CREATE TABLE agent_chat_messages` + `ALTER TABLE agent_sessions ADD claude_session_id`.

- [ ] **Step 4: Vérifier que la migration s'applique**

Run: `npm run dev:web` (laisser démarrer ~5s puis Ctrl-C) — l'import de `src/db/index.ts` joue les migrations.
Expected: pas d'erreur SQL au démarrage. (Alternative sans dev server : `node -e "require('better-sqlite3')('./data/devora.db').prepare('SELECT claude_session_id FROM agent_sessions LIMIT 1').all()"` ne doit pas jeter « no such column ».)

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/migrations
git commit -m "feat(db): agent_chat_messages table + claude_session_id column"
```

---

## Task 2: `transcriptStore` (agent)

**Files:**
- Create: `packages/agent/src/sdk/transcriptStore.ts`
- Test: `packages/agent/src/sdk/transcriptStore.test.ts`

**Interfaces:**
- Consumes: `getDb()` de `../db.js` (peut être `null`), `StreamEvent` de `./types.js`.
- Produces:
  - `appendEvent(sessionId: string, seq: number, role: string, event: StreamEvent): void`
  - `loadTranscript(sessionId: string): { seq: number; event: StreamEvent }[]`
  - `nextSeq(sessionId: string): number` (= `max(seq)+1`, `1` si vide/`null`)
  - `TRUNCATE_LIMIT = 50_000` (octets) appliqué au `content` des events `tool_result`.

- [ ] **Step 1: Écrire les tests**

`packages/agent/src/sdk/transcriptStore.test.ts` :
```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import * as store from './transcriptStore.js';

// Injecte une DB en mémoire via le hook de test (voir implémentation __setDbForTests).
let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE agent_chat_messages (
    id TEXT PRIMARY KEY, agent_session_id TEXT NOT NULL, seq INTEGER NOT NULL,
    role TEXT NOT NULL, event_type TEXT NOT NULL, content TEXT, created_at TEXT);`);
  store.__setDbForTests(db);
});

test('nextSeq = 1 quand vide', () => {
  assert.equal(store.nextSeq('s1'), 1);
});

test('append puis load conserve l ordre par seq', () => {
  store.appendEvent('s1', 1, 'assistant', { event: 'assistant', data: { text: 'a' } });
  store.appendEvent('s1', 2, 'assistant', { event: 'assistant', data: { text: 'b' } });
  const rows = store.loadTranscript('s1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].seq, 1);
  assert.deepEqual(rows[1].event, { event: 'assistant', data: { text: 'b' } });
  assert.equal(store.nextSeq('s1'), 3);
});

test('tool_result volumineux est tronqué avec marqueur', () => {
  const big = 'x'.repeat(60_000);
  store.appendEvent('s1', 1, 'tool', { event: 'tool_result', data: { tool_use_id: 't1', content: big } });
  const [row] = store.loadTranscript('s1');
  const data = (row.event as { data: { content: string; truncated?: boolean } }).data;
  assert.equal(data.truncated, true);
  assert.ok(data.content.length <= store.TRUNCATE_LIMIT);
});

test('isolation par session', () => {
  store.appendEvent('s1', 1, 'assistant', { event: 'assistant', data: { text: 'a' } });
  assert.equal(store.loadTranscript('s2').length, 0);
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `npm test -w packages/agent`
Expected: FAIL (`transcriptStore.js` introuvable).

- [ ] **Step 3: Implémenter `transcriptStore.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../db.js';
import type { StreamEvent } from './types.js';

export const TRUNCATE_LIMIT = 50_000;

// Hook de test : permet d'injecter une DB en mémoire.
let _override: Database.Database | null = null;
export function __setDbForTests(db: Database.Database | null) { _override = db; }
function db(): Database.Database | null { return _override ?? getDb(); }

function truncateEvent(event: StreamEvent): StreamEvent {
  if (event.event !== 'tool_result') return event;
  const content = event.data.content;
  const str = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  if (str.length <= TRUNCATE_LIMIT) return event;
  return { event: 'tool_result', data: { ...event.data, content: str.slice(0, TRUNCATE_LIMIT), truncated: true } } as StreamEvent;
}

export function appendEvent(sessionId: string, seq: number, role: string, event: StreamEvent): void {
  const d = db();
  if (!d) return;
  const safe = truncateEvent(event);
  d.prepare(
    'INSERT INTO agent_chat_messages (id, agent_session_id, seq, role, event_type, content) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(randomUUID(), sessionId, seq, role, safe.event, JSON.stringify(safe));
}

export function loadTranscript(sessionId: string): { seq: number; event: StreamEvent }[] {
  const d = db();
  if (!d) return [];
  const rows = d.prepare(
    'SELECT seq, content FROM agent_chat_messages WHERE agent_session_id = ? ORDER BY seq ASC',
  ).all(sessionId) as { seq: number; content: string }[];
  return rows.map((r) => ({ seq: r.seq, event: JSON.parse(r.content) as StreamEvent }));
}

export function nextSeq(sessionId: string): number {
  const d = db();
  if (!d) return 1;
  const row = d.prepare(
    'SELECT MAX(seq) AS m FROM agent_chat_messages WHERE agent_session_id = ?',
  ).get(sessionId) as { m: number | null };
  return (row?.m ?? 0) + 1;
}
```

- [ ] **Step 4: Étendre `StreamEvent` pour le marqueur `truncated`**

Dans `packages/agent/src/sdk/types.ts`, remplacer la ligne `tool_result` par :
```ts
  | { event: 'tool_result'; data: { tool_use_id: string; content: unknown; truncated?: boolean } }
```

- [ ] **Step 5: Lancer les tests (succès attendu)**

Run: `npm test -w packages/agent`
Expected: PASS (transcriptStore + tests existants inchangés).

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/sdk/transcriptStore.ts packages/agent/src/sdk/transcriptStore.test.ts packages/agent/src/sdk/types.ts
git commit -m "feat(agent): transcriptStore (persist/load/nextSeq + truncation)"
```

---

## Task 3: `activityDeriver` (agent)

**Files:**
- Create: `packages/agent/src/sdk/activityDeriver.ts`
- Test: `packages/agent/src/sdk/activityDeriver.test.ts`

**Interfaces:**
- Consumes: `StreamEvent` de `./types.js`.
- Produces: `deriveLogs(event: StreamEvent): { log_type: string; content: string }[]` (fonction pure ; `[]` si rien à logger).

- [ ] **Step 1: Écrire les tests**

`packages/agent/src/sdk/activityDeriver.test.ts` :
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLogs } from './activityDeriver.js';

test('Edit → file_change avec le chemin', () => {
  const out = deriveLogs({ event: 'tool_use', data: { id: 't1', name: 'Edit', input: { file_path: 'src/a.ts' } } });
  assert.deepEqual(out, [{ log_type: 'file_change', content: 'src/a.ts' }]);
});

test('Write → file_change', () => {
  const out = deriveLogs({ event: 'tool_use', data: { id: 't1', name: 'Write', input: { file_path: 'src/b.ts' } } });
  assert.equal(out[0].log_type, 'file_change');
});

test('Bash git commit → commit avec message', () => {
  const out = deriveLogs({ event: 'tool_use', data: { id: 't1', name: 'Bash', input: { command: 'git commit -m "fix: x"' } } });
  assert.equal(out[0].log_type, 'commit');
  assert.match(out[0].content, /fix: x/);
});

test('Bash autre → info', () => {
  const out = deriveLogs({ event: 'tool_use', data: { id: 't1', name: 'Bash', input: { command: 'ls -la' } } });
  assert.equal(out[0].log_type, 'info');
});

test('result → summary', () => {
  const out = deriveLogs({ event: 'result', data: { is_error: false, text: 'fait', session_id: 's', num_turns: 1, usage: {}, total_cost_usd: 0 } });
  assert.deepEqual(out, [{ log_type: 'summary', content: 'fait' }]);
});

test('thinking/assistant/session → rien', () => {
  assert.deepEqual(deriveLogs({ event: 'thinking', data: { text: 'x' } }), []);
  assert.deepEqual(deriveLogs({ event: 'assistant', data: { text: 'x' } }), []);
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `npm test -w packages/agent`
Expected: FAIL (`activityDeriver.js` introuvable).

- [ ] **Step 3: Implémenter `activityDeriver.ts`**

```ts
import type { StreamEvent } from './types.js';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

export function deriveLogs(event: StreamEvent): { log_type: string; content: string }[] {
  if (event.event === 'tool_use') {
    const { name, input } = event.data;
    const inp = (input ?? {}) as Record<string, unknown>;
    if (FILE_TOOLS.has(name)) {
      const path = String(inp.file_path ?? inp.path ?? name);
      return [{ log_type: 'file_change', content: path }];
    }
    if (name === 'Bash') {
      const cmd = String(inp.command ?? '');
      if (/\bgit\s+commit\b/.test(cmd)) {
        const m = cmd.match(/-m\s+["']([^"']+)["']/);
        return [{ log_type: 'commit', content: m ? m[1] : cmd }];
      }
      return [{ log_type: 'info', content: cmd.slice(0, 200) }];
    }
    return [];
  }
  if (event.event === 'tool_result') {
    return []; // les erreurs d'outil sont visibles dans le chat ; pas de doublon de log ici
  }
  if (event.event === 'result') {
    return [{ log_type: event.data.is_error ? 'error' : 'summary', content: event.data.text }];
  }
  return [];
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `npm test -w packages/agent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/sdk/activityDeriver.ts packages/agent/src/sdk/activityDeriver.test.ts
git commit -m "feat(agent): activityDeriver (events → activity logs)"
```

---

## Task 4: Câbler persistance/seq/resume/dérivation dans `sdkAgent`

**Files:**
- Modify: `packages/agent/src/sdk/sdkAgent.ts`
- Test: `packages/agent/src/sdk/sdkAgent.test.ts` (étendre)

**Interfaces:**
- Consumes: `transcriptStore` (Task 2), `activityDeriver` (Task 3), `getDb()`.
- Produces (protocole, additions rétro-compatibles) :
  - chaque `stream-event` émis porte désormais `seq: number` ;
  - nouveau message serveur `stream-history { events: { seq, event }[] }` envoyé à l'attache **avant** `stream-ready` ;
  - `startOrAttach` résout le resume depuis `agent_sessions.claude_session_id` quand aucune session vivante et aucun `resumeClaudeSessionId` fourni ;
  - le `claudeSessionId` capturé est persisté sur `agent_sessions`.

- [ ] **Step 1: Importer les nouveaux modules**

En tête de `sdkAgent.ts`, après les imports existants :
```ts
import * as transcript from './transcriptStore.js';
import { deriveLogs } from './activityDeriver.js';
import { getDb } from '../db.js';
import { randomUUID } from 'node:crypto';
```

- [ ] **Step 2: Ajouter `seq` à l'état de session**

Dans l'interface `SessionState`, ajouter le champ :
```ts
  seq: number;
```
Et dans la création de `s` (objet `SessionState` dans `startOrAttach`), initialiser :
```ts
        seq: transcript.nextSeq(sessionId),
```
(placer la ligne à côté de `busy: false,`).

- [ ] **Step 3: Persister le `claudeSessionId` + dériver les logs + numéroter dans `runLoop`**

Remplacer le corps de la boucle `for await` dans `runLoop` par :
```ts
      for await (const msg of s.q) {
        for (const ev of mapMessage(msg as never)) {
          if (ev.event === 'session') {
            s.claudeSessionId = ev.data.id;
            persistClaudeSessionId(sessionId, ev.data.id);
          }
          if (ev.event === 'result') s.busy = false;
          const seq = s.seq++;
          const role = ev.event === 'tool_result' ? 'tool'
            : ev.event === 'thinking' || ev.event === 'assistant' || ev.event === 'tool_use' ? 'assistant'
            : 'system';
          transcript.appendEvent(sessionId, seq, role, ev);
          for (const log of deriveLogs(ev)) writeActivityLog(sessionId, log.log_type, log.content);
          broadcast(s, { type: 'stream-event', seq, ...ev });
        }
      }
```

- [ ] **Step 4: Ajouter les helpers DB (raw SQL)**

Juste avant `return {` (l'objet exporté par `createSdkAgentManager`), ajouter :
```ts
  function persistClaudeSessionId(sessionId: string, claudeId: string) {
    const d = getDb();
    if (!d) return;
    try {
      d.prepare('UPDATE agent_sessions SET claude_session_id = ? WHERE session_id = ? AND (claude_session_id IS NULL OR claude_session_id != ?)')
        .run(claudeId, sessionId, claudeId);
    } catch { /* best-effort */ }
  }
  function readClaudeSessionId(sessionId: string): string | null {
    const d = getDb();
    if (!d) return null;
    try {
      const row = d.prepare('SELECT claude_session_id AS c FROM agent_sessions WHERE session_id = ?').get(sessionId) as { c: string | null } | undefined;
      return row?.c ?? null;
    } catch { return null; }
  }
  function writeActivityLog(sessionId: string, logType: string, content: string) {
    const d = getDb();
    if (!d) return;
    try {
      const row = d.prepare('SELECT id FROM agent_sessions WHERE session_id = ?').get(sessionId) as { id: string } | undefined;
      if (!row) return;
      d.prepare('INSERT INTO agent_activity_logs (id, agent_session_id, content, log_type) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), sessionId, content, logType);
    } catch { /* best-effort */ }
  }
```
> Note : `agent_activity_logs.agent_session_id` référence l'`id` (uuid) de `agent_sessions`, pas le `session_id` texte — d'où la lecture de `row.id`. Utiliser `row.id` dans l'INSERT :
```ts
      d.prepare('INSERT INTO agent_activity_logs (id, agent_session_id, content, log_type) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), row.id, content, logType);
```
(corriger l'INSERT ci-dessus pour utiliser `row.id`).

- [ ] **Step 5: Envoyer `stream-history` + résoudre le resume dans `startOrAttach`**

Dans `startOrAttach`, dans la branche `if (existing)` (ré-attache session vivante), avant `send(ws, readyPayload(existing, true))`, insérer :
```ts
        send(ws, { type: 'stream-history', events: transcript.loadTranscript(sessionId) });
```
Puis, dans la branche création (session neuve), après avoir résolu `resume` : remplacer la ligne
```ts
      if (params.resumeClaudeSessionId) options.resume = params.resumeClaudeSessionId;
```
par :
```ts
      const resumeId = params.resumeClaudeSessionId ?? readClaudeSessionId(sessionId);
      if (resumeId) options.resume = resumeId;
```
Et juste après `send(ws, readyPayload(s, false));`, insérer l'historique (transcript d'une session précédente, avant que le live reprenne) :
```ts
      send(ws, { type: 'stream-history', events: transcript.loadTranscript(sessionId) });
```
> Ordre voulu côté client : `stream-history` puis `stream-ready`. Réordonner ces deux `send` pour que `stream-history` précède `readyPayload` dans les deux branches.

- [ ] **Step 6: Étendre les tests d'intégration**

Dans `packages/agent/src/sdk/sdkAgent.test.ts`, ajouter un test vérifiant que les events broadcastés portent un `seq` croissant et qu'un `stream-history` est envoyé à l'attache. (Suivre le style existant du fichier — `queryFn` mocké renvoyant un async-iterable de `SDKMessage`. Injecter une DB `:memory:` via `transcript.__setDbForTests` et créer les tables `agent_chat_messages`, `agent_sessions`, `agent_activity_logs`.)

```ts
import * as transcript from './transcriptStore.js';
// … dans un beforeEach : créer db :memory:, tables, transcript.__setDbForTests(db)
test('les stream-event portent un seq croissant', async () => {
  // arrange : manager avec queryFn mock émettant assistant + result
  // act : startOrAttach + attendre le broadcast
  // assert : les payloads 'stream-event' reçus ont seq 1,2,…
});
```
> Le détail exact du mock suit ce qui existe déjà dans le fichier ; l'assertion clé est `payload.seq` croissant + présence d'un message `{type:'stream-history'}`.

- [ ] **Step 7: Lancer les tests**

Run: `npm test -w packages/agent`
Expected: PASS (nouveaux + existants).

- [ ] **Step 8: Commit**

```bash
git add packages/agent/src/sdk/sdkAgent.ts packages/agent/src/sdk/sdkAgent.test.ts
git commit -m "feat(agent): seq numbering, transcript persist, stream-history, resume from DB, derived logs"
```

---

## Task 5: Types chat + réducteur `reduceStreamEvent` (frontend)

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/chatReducer.ts`
- Test: `src/lib/chatReducer.test.ts`

**Interfaces:**
- Produces (types) : `ChatRole`, `ChatToolCall`, `ChatSegment`, `ChatMessage`, `PermissionDecision`, `PendingPermission`, `StreamEventWire`.
- Produces (fn) : `reduceStreamEvent(messages: ChatMessage[], wire: StreamEventWire): ChatMessage[]` — pur, immutable.

- [ ] **Step 1: Ajouter les types dans `src/types/index.ts`**

À la fin du fichier :
```ts
// ─── Agent Chat (lot 2) ──────────────────────────────────
export type ChatRole = 'user' | 'assistant';

export interface ChatToolCall {
	id: string;
	name: string;
	input: unknown;
	result?: unknown;
	truncated?: boolean;
	status: 'running' | 'done' | 'error';
}

export type ChatSegment =
	| { kind: 'text'; text: string }
	| { kind: 'thinking'; text: string }
	| { kind: 'tool'; call: ChatToolCall };

export interface ChatMessage {
	id: string;
	role: ChatRole;
	segments: ChatSegment[];
}

export type PermissionDecision = 'allow-once' | 'allow-always' | 'reject';

export interface PendingPermission {
	id: string;
	toolName: string;
	input: Record<string, unknown>;
	title?: string;
	displayName?: string;
}

/** Event tel qu'il arrive sur le fil WS (data selon l'`event`). */
export interface StreamEventWire {
	seq: number;
	event: 'session' | 'thinking' | 'assistant' | 'tool_use' | 'tool_result' | 'result';
	data: Record<string, unknown>;
}
```

- [ ] **Step 2: Écrire les tests du réducteur**

`src/lib/chatReducer.test.ts` :
```ts
import { test, expect } from 'vitest';
import { reduceStreamEvent } from './chatReducer';
import type { ChatMessage, StreamEventWire } from '@/types';

const ev = (seq: number, event: StreamEventWire['event'], data: Record<string, unknown>): StreamEventWire => ({ seq, event, data });

test('assistant text crée une bulle assistant', () => {
  const out = reduceStreamEvent([], ev(1, 'assistant', { text: 'Bonjour' }));
  expect(out).toHaveLength(1);
  expect(out[0].role).toBe('assistant');
  expect(out[0].segments).toEqual([{ kind: 'text', text: 'Bonjour' }]);
});

test('deux textes assistant successifs s empilent dans la même bulle', () => {
  let msgs: ChatMessage[] = [];
  msgs = reduceStreamEvent(msgs, ev(1, 'assistant', { text: 'a' }));
  msgs = reduceStreamEvent(msgs, ev(2, 'assistant', { text: 'b' }));
  expect(msgs).toHaveLength(1);
  expect(msgs[0].segments).toEqual([
    { kind: 'text', text: 'a' },
    { kind: 'text', text: 'b' },
  ]);
});

test('thinking ajoute un segment thinking', () => {
  const out = reduceStreamEvent([], ev(1, 'thinking', { text: 'hmm' }));
  expect(out[0].segments[0]).toEqual({ kind: 'thinking', text: 'hmm' });
});

test('tool_use puis tool_result corrèlent par id', () => {
  let msgs = reduceStreamEvent([], ev(1, 'tool_use', { id: 't1', name: 'Read', input: { file_path: 'a.ts' } }));
  msgs = reduceStreamEvent(msgs, ev(2, 'tool_result', { tool_use_id: 't1', content: 'ok', truncated: false }));
  const seg = msgs[0].segments[0];
  expect(seg.kind).toBe('tool');
  if (seg.kind === 'tool') {
    expect(seg.call.status).toBe('done');
    expect(seg.call.result).toBe('ok');
  }
});

test('session et result ne créent pas de bulle', () => {
  let msgs = reduceStreamEvent([], ev(1, 'session', { id: 's', model: 'opus' }));
  msgs = reduceStreamEvent(msgs, ev(2, 'result', { is_error: false, text: '' }));
  expect(msgs).toHaveLength(0);
});
```

- [ ] **Step 3: Lancer (échec attendu)**

Run: `npm run test:web`
Expected: FAIL (`chatReducer` introuvable).

- [ ] **Step 4: Implémenter `src/lib/chatReducer.ts`**

```ts
import type { ChatMessage, ChatSegment, ChatToolCall, StreamEventWire } from '@/types';

let _uid = 0;
const nextId = () => `m${Date.now().toString(36)}-${_uid++}`;

// Renvoie une nouvelle liste ; ne mute jamais l'entrée.
export function reduceStreamEvent(messages: ChatMessage[], wire: StreamEventWire): ChatMessage[] {
	const { event, data } = wire;

	if (event === 'session' || event === 'result') return messages;

	if (event === 'tool_result') {
		const toolUseId = String(data.tool_use_id ?? '');
		return messages.map((m) => ({
			...m,
			segments: m.segments.map((s) =>
				s.kind === 'tool' && s.call.id === toolUseId
					? { kind: 'tool', call: { ...s.call, result: data.content, truncated: Boolean(data.truncated), status: 'done' } }
					: s,
			),
		}));
	}

	let segment: ChatSegment;
	if (event === 'thinking') segment = { kind: 'thinking', text: String(data.text ?? '') };
	else if (event === 'assistant') segment = { kind: 'text', text: String(data.text ?? '') };
	else {
		const call: ChatToolCall = { id: String(data.id ?? ''), name: String(data.name ?? ''), input: data.input, status: 'running' };
		segment = { kind: 'tool', call };
	}

	const last = messages[messages.length - 1];
	if (last && last.role === 'assistant') {
		const updated: ChatMessage = { ...last, segments: [...last.segments, segment] };
		return [...messages.slice(0, -1), updated];
	}
	return [...messages, { id: nextId(), role: 'assistant', segments: [segment] }];
}

export function userMessage(text: string): ChatMessage {
	return { id: nextId(), role: 'user', segments: [{ kind: 'text', text }] };
}
```

- [ ] **Step 5: Lancer (succès attendu)**

Run: `npm run test:web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/chatReducer.ts src/lib/chatReducer.test.ts
git commit -m "feat(chat): chat types + reduceStreamEvent reducer"
```

---

## Task 6: Hook `useAgentChat` (frontend)

**Files:**
- Create: `src/hooks/useAgentChat.ts`
- Test: `src/hooks/useAgentChat.test.ts`

**Interfaces:**
- Consumes: `reduceStreamEvent`, `userMessage` (Task 5), `getAgentWsUrl()` de `@/lib/local-fetch`, types chat.
- Produces:
```ts
useAgentChat(params: {
  sessionId: string; cwd: string | null; systemPrompt?: string;
  enabled: boolean; readOnly?: boolean;
  model?: string; effort?: string; permissionMode?: string;
}): {
  messages: ChatMessage[];
  status: 'connecting' | 'idle' | 'busy' | 'error' | 'closed';
  model: string; effort: string; permissionMode: string;
  pendingPermissions: PendingPermission[];
  send(text: string): void;
  setModel(m: string): void; setEffort(e: string): void; setPermissionMode(m: string): void;
  interrupt(): void;
  resolvePermission(id: string, decision: PermissionDecision): void;
}
```

- [ ] **Step 1: Écrire les tests (WS mocké)**

`src/hooks/useAgentChat.test.ts` :
```ts
import { test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgentChat } from './useAgentChat';

// Mock WebSocket minimal contrôlable.
class MockWS {
  static last: MockWS;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  constructor(public url: string) { MockWS.last = this; }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; this.onclose?.(); }
  _open() { this.readyState = 1; this.onopen?.(); }
  _emit(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}
beforeEach(() => { vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket); });

const params = { sessionId: 's1', cwd: '/tmp', enabled: true };

test('envoie stream-init à l ouverture', async () => {
  renderHook(() => useAgentChat(params));
  act(() => MockWS.last._open());
  const init = MockWS.last.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'stream-init');
  expect(init).toMatchObject({ sessionId: 's1', cwd: '/tmp' });
});

test('stream-history initialise les messages', async () => {
  const { result } = renderHook(() => useAgentChat(params));
  act(() => { MockWS.last._open(); MockWS.last._emit({ type: 'stream-history', events: [{ seq: 1, event: { event: 'assistant', data: { text: 'salut' } } }] }); });
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
});

test('dédup par seq : un event déjà vu en history n est pas réappliqué', async () => {
  const { result } = renderHook(() => useAgentChat(params));
  act(() => {
    MockWS.last._open();
    MockWS.last._emit({ type: 'stream-history', events: [{ seq: 1, event: { event: 'assistant', data: { text: 'A' } } }] });
    MockWS.last._emit({ type: 'stream-event', seq: 1, event: 'assistant', data: { text: 'A' } }); // doublon live
    MockWS.last._emit({ type: 'stream-event', seq: 2, event: 'assistant', data: { text: 'B' } });
  });
  await waitFor(() => expect(result.current.messages[0].segments).toEqual([
    { kind: 'text', text: 'A' }, { kind: 'text', text: 'B' },
  ]));
});

test('send ajoute une bulle user optimiste + envoie stream-user-message', async () => {
  const { result } = renderHook(() => useAgentChat(params));
  act(() => MockWS.last._open());
  act(() => result.current.send('go'));
  expect(result.current.messages.at(-1)).toMatchObject({ role: 'user' });
  const um = MockWS.last.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'stream-user-message');
  expect(um).toMatchObject({ text: 'go' });
});

test('permission request puis resolve', async () => {
  const { result } = renderHook(() => useAgentChat(params));
  act(() => { MockWS.last._open(); MockWS.last._emit({ type: 'stream-permission-request', id: 'p1', toolName: 'Bash', input: {} }); });
  await waitFor(() => expect(result.current.pendingPermissions).toHaveLength(1));
  act(() => result.current.resolvePermission('p1', 'allow-once'));
  expect(result.current.pendingPermissions).toHaveLength(0);
  const resp = MockWS.last.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'stream-permission-response');
  expect(resp).toMatchObject({ id: 'p1', decision: 'allow-once' });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npm run test:web`
Expected: FAIL (`useAgentChat` introuvable).

- [ ] **Step 3: Implémenter `src/hooks/useAgentChat.ts`**

```ts
'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getAgentWsUrl } from '@/lib/local-fetch';
import { reduceStreamEvent, userMessage } from '@/lib/chatReducer';
import type { ChatMessage, PendingPermission, PermissionDecision, StreamEventWire } from '@/types';

interface Params {
	sessionId: string;
	cwd: string | null;
	systemPrompt?: string;
	enabled: boolean;
	readOnly?: boolean;
	model?: string;
	effort?: string;
	permissionMode?: string;
}

type Status = 'connecting' | 'idle' | 'busy' | 'error' | 'closed';

export function useAgentChat(p: Params) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<Status>('connecting');
	const [model, setModelState] = useState(p.model ?? '');
	const [effort, setEffortState] = useState(p.effort ?? '');
	const [permissionMode, setPermState] = useState(p.permissionMode ?? '');
	const [pendingPermissions, setPending] = useState<PendingPermission[]>([]);
	const wsRef = useRef<WebSocket | null>(null);
	const lastSeqRef = useRef(0);
	const [, force] = useReducer((x) => x + 1, 0);

	const applyWire = useCallback((wire: StreamEventWire) => {
		if (wire.seq <= lastSeqRef.current) return; // dédup exactly-once
		lastSeqRef.current = wire.seq;
		setMessages((prev) => reduceStreamEvent(prev, wire));
	}, []);

	useEffect(() => {
		if (!p.enabled || !p.cwd || p.readOnly) return;
		const ws = new WebSocket(getAgentWsUrl());
		wsRef.current = ws;
		lastSeqRef.current = 0;
		setStatus('connecting');
		setMessages([]);

		ws.onopen = () => {
			ws.send(JSON.stringify({
				type: 'stream-init',
				sessionId: p.sessionId, cwd: p.cwd, systemPrompt: p.systemPrompt,
				model: p.model, effort: p.effort, permissionMode: p.permissionMode,
			}));
		};
		ws.onmessage = (e) => {
			let msg: Record<string, unknown>;
			try { msg = JSON.parse(e.data); } catch { return; }
			switch (msg.type) {
				case 'stream-history': {
					const events = (msg.events as { seq: number; event: Omit<StreamEventWire, 'seq'> }[]) ?? [];
					for (const row of events) applyWire({ seq: row.seq, ...row.event });
					break;
				}
				case 'stream-ready':
					setModelState(String(msg.model ?? ''));
					setEffortState(String(msg.effort ?? ''));
					setPermState(String(msg.permissionMode ?? ''));
					setPending((msg.pendingPermissions as PendingPermission[]) ?? []);
					setStatus(msg.busy ? 'busy' : 'idle');
					break;
				case 'stream-event':
					if (msg.event === 'result') setStatus('idle');
					else if (msg.event === 'session') { setModelState(String((msg.data as Record<string, unknown>)?.model ?? model)); }
					else setStatus('busy');
					applyWire(msg as unknown as StreamEventWire);
					break;
				case 'stream-permission-request':
					setPending((prev) => [...prev, msg as unknown as PendingPermission]);
					break;
				case 'stream-error':
					setStatus('error');
					break;
				case 'stream-closed':
					setStatus('closed');
					break;
			}
			force();
		};
		ws.onerror = () => setStatus('error');
		ws.onclose = () => setStatus((s) => (s === 'error' ? s : 'closed'));

		return () => { ws.close(); wsRef.current = null; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [p.enabled, p.cwd, p.readOnly, p.sessionId]);

	const sendCtl = (obj: Record<string, unknown>) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ...obj, sessionId: p.sessionId }));
	};

	const send = useCallback((text: string) => {
		const t = text.trim();
		if (!t) return;
		setMessages((prev) => [...prev, userMessage(t)]);
		setStatus('busy');
		sendCtl({ type: 'stream-user-message', text: t });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [p.sessionId]);

	const setModel = useCallback((m: string) => { setModelState(m); sendCtl({ type: 'stream-set-model', model: m }); /* eslint-disable-next-line */ }, [p.sessionId]);
	const setEffort = useCallback((e: string) => { setEffortState(e); sendCtl({ type: 'stream-set-effort', effort: e }); /* eslint-disable-next-line */ }, [p.sessionId]);
	const setPermissionMode = useCallback((m: string) => { setPermState(m); sendCtl({ type: 'stream-set-mode', permissionMode: m }); /* eslint-disable-next-line */ }, [p.sessionId]);
	const interrupt = useCallback(() => sendCtl({ type: 'stream-interrupt' }), [p.sessionId]);
	const resolvePermission = useCallback((id: string, decision: PermissionDecision) => {
		setPending((prev) => prev.filter((x) => x.id !== id));
		sendCtl({ type: 'stream-permission-response', id, decision });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [p.sessionId]);

	return { messages, status, model, effort, permissionMode, pendingPermissions, send, setModel, setEffort, setPermissionMode, interrupt, resolvePermission };
}
```

- [ ] **Step 4: Lancer (succès attendu)**

Run: `npm run test:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAgentChat.ts src/hooks/useAgentChat.test.ts
git commit -m "feat(chat): useAgentChat WS state machine (seq dedup, permissions, controls)"
```

---

## Task 7: Composants présentationnels de base + i18n

**Files:**
- Create: `src/components/agents/chat/ChatBubble.tsx`
- Create: `src/components/agents/chat/ChatThinking.tsx`
- Create: `src/components/agents/chat/ChatToolCard.tsx`
- Create: `src/components/agents/chat/ChatPermissionCard.tsx`
- Modify: `src/config/translate/en.json`, `fr.json`, `es.json`, `de.json`, `pt.json`

**Interfaces:**
- Consumes: types `ChatMessage`, `ChatToolCall`, `PendingPermission`, `PermissionDecision`.
- Produces:
  - `<ChatBubble message={ChatMessage} />`
  - `<ChatThinking text={string} />`
  - `<ChatToolCard call={ChatToolCall} />`
  - `<ChatPermissionCard perm={PendingPermission} onDecide={(id, decision) => void} />`

- [ ] **Step 1: Ajouter les clés i18n `agentChat` (fr)**

Dans `src/config/translate/fr.json`, ajouter à la racine :
```json
"agentChat": {
  "composerPlaceholder": "Message à l'agent…",
  "send": "Envoyer",
  "stop": "Stop",
  "model": "Model",
  "effort": "Effort",
  "mode": "Mode",
  "thinking": "Réflexion",
  "toolRunning": "en cours…",
  "permissionTitle": "Autorisation demandée",
  "allowOnce": "Autoriser",
  "allowAlways": "Toujours pour {tool}",
  "reject": "Refuser",
  "truncated": "sortie tronquée",
  "resume": "Reprendre",
  "readOnly": "Session terminée — lecture seule",
  "reconnect": "Reconnecter",
  "errorBanner": "Connexion à l'agent perdue",
  "effortLow": "Low", "effortMedium": "Medium", "effortHigh": "High", "effortMax": "Max",
  "modePlan": "Plan", "modeAcceptEdits": "Accept edits", "modeBypass": "Bypass",
  "modelOpus": "Opus 4.8", "modelSonnet": "Sonnet 5", "modelHaiku": "Haiku 4.5"
}
```

- [ ] **Step 2: Répliquer les clés dans `en/es/de/pt`**

Copier le même bloc dans `en.json`, `es.json`, `de.json`, `pt.json` en traduisant les valeurs (les clés techniques `modelOpus`, etc. restent identiques ; traduire `composerPlaceholder`, `send`, `stop`, `thinking`, `permissionTitle`, `allowOnce`, `reject`, `truncated`, `resume`, `readOnly`, `reconnect`, `errorBanner`). Garder `{tool}` intact dans `allowAlways`.

- [ ] **Step 3: `ChatThinking.tsx`**

```tsx
'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import { useTranslations } from 'next-intl';

export default function ChatThinking({ text }: { text: string }) {
	const t = useTranslations('agentChat');
	const [open, setOpen] = useState(false);
	return (
		<Box sx={{ my: 0.5 }}>
			<Box onClick={() => setOpen((o) => !o)} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', color: 'text.disabled', fontSize: '0.7rem' }}>
				<PsychologyRoundedIcon sx={{ fontSize: 14 }} />
				<Typography variant="caption" sx={{ fontStyle: 'italic' }}>{t('thinking')}</Typography>
			</Box>
			<Collapse in={open}>
				<Typography variant="caption" sx={{ display: 'block', pl: 2.5, color: 'text.disabled', whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>{text}</Typography>
			</Collapse>
		</Box>
	);
}
```

- [ ] **Step 4: `ChatToolCard.tsx`**

```tsx
'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { ChatToolCall } from '@/types';

function target(call: ChatToolCall): string {
	const inp = (call.input ?? {}) as Record<string, unknown>;
	return String(inp.file_path ?? inp.path ?? inp.command ?? '');
}

export default function ChatToolCard({ call }: { call: ChatToolCall }) {
	const t = useTranslations('agentChat');
	const [open, setOpen] = useState(false);
	const resultText = typeof call.result === 'string' ? call.result : call.result != null ? JSON.stringify(call.result, null, 2) : '';
	return (
		<Box sx={{ my: 0.5, border: 1, borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', maxWidth: '92%' }}>
			<Box onClick={() => setOpen((o) => !o)} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.75, cursor: 'pointer', bgcolor: (th) => alpha(th.palette.primary.main, 0.08) }}>
				<BuildRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
				<Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>{call.name}</Typography>
				<Typography variant="caption" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{target(call)}</Typography>
				{call.status === 'running' ? <CircularProgress size={12} /> : <CheckRoundedIcon sx={{ fontSize: 14, color: call.status === 'error' ? 'error.main' : 'success.main' }} />}
			</Box>
			<Collapse in={open}>
				<Box sx={{ px: 1.25, py: 1, borderTop: 1, borderColor: 'divider', fontFamily: 'monospace', fontSize: '0.7rem', whiteSpace: 'pre-wrap', color: 'text.secondary' }}>
					{resultText || '—'}
					{call.truncated && <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', mt: 0.5 }}>… {t('truncated')}</Typography>}
				</Box>
			</Collapse>
		</Box>
	);
}
```

- [ ] **Step 5: `ChatBubble.tsx`**

```tsx
'use client';
import Box from '@mui/material/Box';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatThinking from './ChatThinking';
import ChatToolCard from './ChatToolCard';
import type { ChatMessage } from '@/types';

export default function ChatBubble({ message }: { message: ChatMessage }) {
	const isUser = message.role === 'user';
	return (
		<Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', px: 2, py: 0.5 }}>
			<Box
				sx={{
					maxWidth: isUser ? '78%' : '92%',
					px: isUser ? 1.5 : 0,
					py: isUser ? 1 : 0,
					borderRadius: 2,
					bgcolor: isUser ? 'primary.main' : 'transparent',
					color: isUser ? 'primary.contrastText' : 'text.primary',
					fontSize: '0.8rem',
					lineHeight: 1.5,
					'& p': { m: 0 },
					'& pre': { overflowX: 'auto', bgcolor: 'background.default', p: 1, borderRadius: 1 },
				}}
			>
				{message.segments.map((seg, i) => {
					if (seg.kind === 'thinking') return <ChatThinking key={i} text={seg.text} />;
					if (seg.kind === 'tool') return <ChatToolCard key={i} call={seg.call} />;
					return isUser ? (
						<span key={i}>{seg.text}</span>
					) : (
						<ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{seg.text}</ReactMarkdown>
					);
				})}
			</Box>
		</Box>
	);
}
```

- [ ] **Step 6: `ChatPermissionCard.tsx`**

```tsx
'use client';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { PendingPermission, PermissionDecision } from '@/types';

export default function ChatPermissionCard({ perm, onDecide }: { perm: PendingPermission; onDecide: (id: string, d: PermissionDecision) => void }) {
	const t = useTranslations('agentChat');
	const preview = perm.input?.command ? String(perm.input.command) : JSON.stringify(perm.input ?? {}, null, 2);
	return (
		<Box sx={{ mx: 2, my: 1, border: 1, borderColor: (th) => alpha(th.palette.warning.main, 0.5), borderRadius: 2, overflow: 'hidden', bgcolor: (th) => alpha(th.palette.warning.main, 0.07), maxWidth: '92%' }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 1, borderBottom: 1, borderColor: (th) => alpha(th.palette.warning.main, 0.25) }}>
				<WarningAmberRoundedIcon sx={{ fontSize: 16, color: 'warning.main' }} />
				<Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.main' }}>{t('permissionTitle')} — {perm.displayName ?? perm.toolName}</Typography>
			</Box>
			<Box sx={{ px: 1.5, py: 1, fontFamily: 'monospace', fontSize: '0.7rem', whiteSpace: 'pre-wrap', bgcolor: 'background.default' }}>{preview}</Box>
			<Box sx={{ display: 'flex', gap: 1, px: 1.5, py: 1 }}>
				<Button size="small" variant="contained" color="success" onClick={() => onDecide(perm.id, 'allow-once')} sx={{ textTransform: 'none' }}>{t('allowOnce')}</Button>
				<Button size="small" variant="outlined" color="success" onClick={() => onDecide(perm.id, 'allow-always')} sx={{ textTransform: 'none' }}>{t('allowAlways', { tool: perm.toolName })}</Button>
				<Button size="small" variant="outlined" color="error" onClick={() => onDecide(perm.id, 'reject')} sx={{ textTransform: 'none' }}>{t('reject')}</Button>
			</Box>
		</Box>
	);
}
```

- [ ] **Step 7: Vérifier la compilation (typecheck)**

Run: `npx tsc --noEmit`
Expected: pas d'erreur liée aux fichiers `chat/*` ni aux locales.

- [ ] **Step 8: Commit**

```bash
git add src/components/agents/chat/ChatBubble.tsx src/components/agents/chat/ChatThinking.tsx src/components/agents/chat/ChatToolCard.tsx src/components/agents/chat/ChatPermissionCard.tsx src/config/translate
git commit -m "feat(chat): presentational components (bubble, thinking, tool card, permission) + i18n"
```

---

## Task 8: `ChatComposer` (composer + barre de contrôle)

**Files:**
- Create: `src/components/agents/chat/ChatComposer.tsx`

**Interfaces:**
- Consumes: clés i18n `agentChat`, constantes model/effort/mode (Global Constraints).
- Produces:
```ts
<ChatComposer
  disabled={boolean}
  busy={boolean}
  model={string} effort={string} permissionMode={string}
  onSend={(text: string) => void}
  onStop={() => void}
  onModel={(m: string) => void} onEffort={(e: string) => void} onMode={(m: string) => void}
/>
```

- [ ] **Step 1: Implémenter `ChatComposer.tsx`**

```tsx
'use client';
import { useState, type KeyboardEvent } from 'react';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import ArrowDropDownRoundedIcon from '@mui/icons-material/ArrowDropDownRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';

const MODELS = [
	{ value: 'opus', key: 'modelOpus' },
	{ value: 'sonnet', key: 'modelSonnet' },
	{ value: 'haiku', key: 'modelHaiku' },
] as const;
const EFFORTS = [
	{ value: 'low', key: 'effortLow' },
	{ value: 'medium', key: 'effortMedium' },
	{ value: 'high', key: 'effortHigh' },
	{ value: 'max', key: 'effortMax' },
] as const;
const MODES = [
	{ value: 'plan', key: 'modePlan' },
	{ value: 'acceptEdits', key: 'modeAcceptEdits' },
	{ value: 'bypassPermissions', key: 'modeBypass' },
] as const;

interface Props {
	disabled?: boolean;
	busy?: boolean;
	model: string;
	effort: string;
	permissionMode: string;
	onSend: (text: string) => void;
	onStop: () => void;
	onModel: (m: string) => void;
	onEffort: (e: string) => void;
	onMode: (m: string) => void;
}

function Pill({ label, options, value, onPick, tKey }: {
	label: string;
	options: readonly { value: string; key: string }[];
	value: string;
	onPick: (v: string) => void;
	tKey: (k: string) => string;
}) {
	const [anchor, setAnchor] = useState<null | HTMLElement>(null);
	const current = options.find((o) => o.value === value);
	return (
		<>
			<Button size="small" onClick={(e) => setAnchor(e.currentTarget)} endIcon={<ArrowDropDownRoundedIcon />}
				sx={{ textTransform: 'none', fontSize: '0.7rem', color: 'text.secondary', borderRadius: 999, px: 1, minWidth: 0 }}>
				{label}: {current ? tKey(current.key) : '—'}
			</Button>
			<Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
				{options.map((o) => (
					<MenuItem key={o.value} selected={o.value === value} onClick={() => { onPick(o.value); setAnchor(null); }} sx={{ fontSize: '0.8rem' }}>
						{tKey(o.key)}
					</MenuItem>
				))}
			</Menu>
		</>
	);
}

export default function ChatComposer({ disabled, busy, model, effort, permissionMode, onSend, onStop, onModel, onEffort, onMode }: Props) {
	const t = useTranslations('agentChat');
	const [text, setText] = useState('');
	const submit = () => { if (!text.trim()) return; onSend(text); setText(''); };
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
	};
	return (
		<Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
			<Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2.5, px: 1.5, py: 1, bgcolor: (th) => alpha(th.palette.text.primary, 0.03) }}>
				<InputBase
					fullWidth multiline maxRows={8}
					placeholder={t('composerPlaceholder')}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={onKey}
					disabled={disabled}
					sx={{ fontSize: '0.8rem', mb: 1 }}
				/>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<Pill label={t('model')} options={MODELS} value={model} onPick={onModel} tKey={t} />
					<Pill label={t('effort')} options={EFFORTS} value={effort} onPick={onEffort} tKey={t} />
					<Pill label={t('mode')} options={MODES} value={permissionMode} onPick={onMode} tKey={t} />
					<Box sx={{ flex: 1 }} />
					{busy ? (
						<IconButton size="small" color="error" onClick={onStop}><StopRoundedIcon /></IconButton>
					) : (
						<IconButton size="small" color="primary" onClick={submit} disabled={disabled || !text.trim()}><SendRoundedIcon /></IconButton>
					)}
				</Box>
			</Box>
		</Box>
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/agents/chat/ChatComposer.tsx
git commit -m "feat(chat): ChatComposer with integrated model/effort/mode controls"
```

---

## Task 9: `AgentChatTab` (composition)

**Files:**
- Create: `src/components/agents/AgentChatTab.tsx`

**Interfaces:**
- Consumes: `useAgentChat` (Task 6), `ChatBubble`/`ChatPermissionCard`/`ChatComposer`, i18n.
- Produces:
```ts
<AgentChatTab
  sessionId={string}
  cwd={string | null}
  systemPrompt={string | undefined}
  isPastSession={boolean}
  initialModel={string} initialEffort={string} initialMode={string}
  onFirstUserMessage?={(text: string) => void}
/>
```

- [ ] **Step 1: Implémenter `AgentChatTab.tsx`**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { useTranslations } from 'next-intl';
import { useAgentChat } from '@/hooks/useAgentChat';
import ChatBubble from './chat/ChatBubble';
import ChatPermissionCard from './chat/ChatPermissionCard';
import ChatComposer from './chat/ChatComposer';

interface Props {
	sessionId: string;
	cwd: string | null;
	systemPrompt?: string;
	isPastSession?: boolean;
	initialModel?: string;
	initialEffort?: string;
	initialMode?: string;
	onFirstUserMessage?: (text: string) => void;
}

export default function AgentChatTab({ sessionId, cwd, systemPrompt, isPastSession, initialModel, initialEffort, initialMode, onFirstUserMessage }: Props) {
	const t = useTranslations('agentChat');
	// Past session: read-only until user hits "Reprendre".
	const [readOnly, setReadOnly] = useState(!!isPastSession);
	const firstSent = useRef(false);

	const chat = useAgentChat({
		sessionId, cwd, systemPrompt, enabled: true, readOnly,
		model: initialModel ?? 'opus', effort: initialEffort ?? 'high', permissionMode: initialMode ?? 'acceptEdits',
	});

	const scrollRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
		if (nearBottom) el.scrollTop = el.scrollHeight;
	}, [chat.messages, chat.pendingPermissions]);

	const handleSend = (text: string) => {
		if (!firstSent.current) { firstSent.current = true; onFirstUserMessage?.(text); }
		chat.send(text);
	};

	const busy = chat.status === 'busy';
	return (
		<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: 'background.default' }}>
			{chat.status === 'error' && (
				<Alert severity="error" sx={{ m: 1 }} action={<Button color="inherit" size="small" onClick={() => setReadOnly((r) => r)}>{t('reconnect')}</Button>}>{t('errorBanner')}</Alert>
			)}
			<Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
				{chat.messages.map((m) => <ChatBubble key={m.id} message={m} />)}
				{chat.pendingPermissions.map((p) => <ChatPermissionCard key={p.id} perm={p} onDecide={chat.resolvePermission} />)}
			</Box>
			{readOnly ? (
				<Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
					<Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>{t('readOnly')}</Typography>
					<Button size="small" variant="contained" startIcon={<PlayArrowRoundedIcon />} onClick={() => setReadOnly(false)} sx={{ textTransform: 'none' }}>{t('resume')}</Button>
				</Box>
			) : (
				<ChatComposer
					disabled={busy} busy={busy}
					model={chat.model} effort={chat.effort} permissionMode={chat.permissionMode}
					onSend={handleSend} onStop={chat.interrupt}
					onModel={chat.setModel} onEffort={chat.setEffort} onMode={chat.setPermissionMode}
				/>
			)}
		</Box>
	);
}
```

> Décision tranchée (spec, point ouvert #2) : l'état `readOnly`/« Reprendre » vit **local au tab** (`AgentChatTab`).
> Décision tranchée (point ouvert #1) : l'auto-rename se fait **côté client** via `onFirstUserMessage` remonté à `AgentTerminalModal` (Task 10).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/agents/AgentChatTab.tsx
git commit -m "feat(chat): AgentChatTab composition (stream view + composer + read-only resume)"
```

---

## Task 10: Intégration dans `AgentTerminalModal` + retrait code mort

**Files:**
- Modify: `src/components/agents/AgentTerminalModal.tsx`

**Interfaces:**
- Consumes: `AgentChatTab` (Task 9), `submitRenameFromPrompt` (existant dans le fichier).

- [ ] **Step 1: Importer `AgentChatTab`**

Après les imports `AgentActivityTab`/`AgentDiffTab`/`AgentIssueTab` :
```ts
import AgentChatTab from './AgentChatTab';
```

- [ ] **Step 2: Composer le systemPrompt SANS reporting curl**

Ajouter, près des `useMemo` existants (après `effectivePath`), un memo pour le prompt chat :
```ts
	const chatSystemPrompt = useMemo(() => {
		const base = agentFile ? agentFile.content : '';
		const issueBlock = issueCtxRef.current ? `\n\n${issueCtxRef.current}` : '';
		return (base + issueBlock).trim() || undefined;
	}, [agentFile]);
```

- [ ] **Step 3: Rendre le tab `claude` avec le chat**

Remplacer **tout** le bloc « Terminal panel » (le `<Box>` avec `display: activeTabKey === 'claude' ? 'flex' : 'none'` contenant `picking`, `isPastSession`, et `<Box ref={setTermNode}>`) par :
```tsx
							{/* Claude chat panel */}
							{activeTabKey === 'claude' && (
								<AgentChatTab
									sessionId={sessionId}
									cwd={effectivePath ?? null}
									systemPrompt={chatSystemPrompt}
									isPastSession={isPastSession}
									onFirstUserMessage={(text) => {
										if (autoNamedRef.current && !promptSentRef.current) {
											promptSentRef.current = true;
											submitRenameFromPrompt(text);
										}
									}}
								/>
							)}
```

- [ ] **Step 4: Masquer le bouton PiP sur le chat**

Trouver le bloc du bouton PiP (`{step === 'terminal' && (` … `<PictureInPictureAltRoundedIcon`). Modifier la condition en :
```tsx
							{step === 'terminal' && activeTabKey !== 'claude' && (
```

- [ ] **Step 5: Toujours afficher le tab `claude` (y compris session passée)**

Dans le `useMemo` `termTabs`, retirer la garde `if (!isPastSession)` autour du push de l'onglet `claude` (le premier push). Le push de l'onglet `terminal` (shell) garde sa garde `!isPastSession`.

Remplacer :
```ts
		if (!isPastSession) {
			items.push({
				key: 'claude',
				label: (
					<>
						<SmartToyRoundedIcon sx={{ fontSize: 16 }} /> Claude
					</>
				),
			});
		}
```
par :
```ts
		items.push({
			key: 'claude',
			label: (
				<>
					<SmartToyRoundedIcon sx={{ fontSize: 16 }} /> Claude
				</>
			),
		});
```

- [ ] **Step 6: Retirer le code mort du path Claude**

Supprimer de `AgentTerminalModal.tsx` :
1. La fonction `buildReportingPrompt` (lignes ~97-157).
2. La fonction `captureFirstPrompt` (le `useCallback` complet) + les refs `promptBufferRef` (garder `promptSentRef` et `autoNamedRef` : ils servent encore à l'auto-rename via `onFirstUserMessage`).
3. Tout le `useEffect` « Claude terminal » (le gros bloc `useEffect` qui crée le `Terminal` xterm pour Claude, ~lignes 707-899), ainsi que les refs devenues inutilisées : `termNode`/`setTermNode`, `terminalRef`, `wsRef`, `fitAddonRef`, `streamTimeoutRef`, `readyRef`, `claudeLaunchedRef`, `isStreamingRef`, `isStreaming`/`setIsStreaming`, `resumed`/`setResumed`.
4. Adapter les usages restants : le `Chip` « Reprise » (`resumed`) est retiré ; `AgentActivityTab` recevait `isStreaming` → passer `isStreaming={false}` (ou retirer la prop si `AgentActivityTab` la rend optionnelle — vérifier sa signature et ajuster).

> ⚠️ Ne PAS toucher au `useEffect` « Plain shell terminal » ni aux refs `shell*` : le tab Terminal reste sur xterm/tmux.

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur, aucune variable inutilisée signalée pour les refs supprimées.

- [ ] **Step 8: Commit**

```bash
git add src/components/agents/AgentTerminalModal.tsx
git commit -m "feat(chat): wire AgentChatTab into modal, drop xterm Claude path + curl reporting"
```

---

## Task 11: Vérification end-to-end (verify manuel)

**Files:** aucun (checklist d'exécution).

**Interfaces:** valide l'intégration complète des tasks 1-10.

- [ ] **Step 1: Démarrer l'app + l'agent**

Run: `npm run dev` (lance web + agent via `scripts/dev-auto-port.mjs`, partage `DEVORA_DB_PATH`).
Prérequis : binaire `claude` installé + `claude login` fait.

- [ ] **Step 2: Lancer un agent et converser**

Ouvrir un agent depuis la page Agents → créer un worktree → onglet Claude (chat). Envoyer « Liste les fichiers du dossier ». Vérifier : bulle user à droite (violet), réponse assistant à gauche (markdown), carte d'outil `Bash`/`Read` repliable avec ✓.

- [ ] **Step 3: Permissions (mode `default`)**

Via la pill Mode, passer sur un mode qui déclenche les prompts (tester `plan` puis re-`default` si exposé). Demander une commande sensible → une carte permission inline apparaît → tester **Autoriser** / **Refuser**.

- [ ] **Step 4: Contrôles à chaud**

Changer Model (opus→sonnet) et Mode pendant la session ; vérifier que la sélection est reflétée et qu'un nouveau tour utilise le nouveau réglage (le model change visiblement).

- [ ] **Step 5: Persistance / réouverture**

Fermer le modal, le rouvrir sur la même session → le transcript est rejoué (bulles précédentes présentes). Vérifier dans la DB : `SELECT COUNT(*) FROM agent_chat_messages WHERE agent_session_id = '<sessionId>'` > 0 et `SELECT claude_session_id FROM agent_sessions WHERE session_id = '<sessionId>'` non nul.

- [ ] **Step 6: Logs d'activité dérivés**

Onglet Activity : vérifier des logs `file_change`/`commit`/`summary` générés **sans** que l'agent ait lancé de curl. Vérifier le dashboard/summaries alimentés.

- [ ] **Step 7: Session passée en lecture seule + Reprendre**

Depuis l'historique, ouvrir une session `completed` → onglet Claude affiche le transcript en lecture seule (bandeau + bouton Reprendre). Cliquer Reprendre → composer réactivé, un nouveau message continue la conversation (resume).

- [ ] **Step 8: Non-régression**

Vérifier que les onglets Activity / Fichiers / Terminal (shell) / Issue fonctionnent, que le PiP est masqué sur le chat mais présent sur les autres onglets terminal, et que le flow de lancement (project → launch-mode → branch) est intact.

- [ ] **Step 9: Suite de tests complète**

Run: `npm run test:web && npm test -w packages/agent`
Expected: tout PASS.

---

## Notes de self-review

- **Couverture spec** : chat Messenger (T7-T9), composer/contrôles (T8), useAgentChat+réducteur+dédup seq (T5-T6), persistance transcript + seq + resume serveur (T1,T2,T4), dérivation logs (T3,T4), retrait reporting curl + capture clavier (T10), sessions passées read-only + Reprendre (T9,T10), PiP masqué + tab visibility (T10), troncature tool_result (T2 + affichage T7). Vitest (T0). Verify (T11).
- **Points ouverts de la spec tranchés dans le plan** : auto-rename côté client (T10 Step 3), état readOnly local au tab (T9 Step 1), `appendEvent`+broadcast dans la boucle par-event (T4 Step 3).
- **Effort mid-session** : la pill Effort envoie `stream-set-effort` (best-effort, cf. lot 1) ; l'UI reflète immédiatement la sélection — comportement documenté, non garanti mid-session.
