# Lot 1 — Backend gestionnaire de sessions Claude Agent SDK : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exposer, dans le serveur agent (`packages/agent/`), un canal WebSocket bidirectionnel qui pilote une session `@anthropic-ai/claude-agent-sdk` persistante par session Devora et diffuse les messages structurés + un flux de permission complet.

**Architecture:** Un manager de sessions (`sdkAgent.ts`) tient une `Map<sessionId, SessionState>`. Chaque session lance `query()` en *streaming input mode*, alimenté par une file async (`promptQueue.ts`). La boucle `for await` mappe chaque `SDKMessage` en `StreamEvent` (`mapMessage.ts`, whitelist) et le broadcast aux WebSockets attachés. En `permissionMode: 'default'`, un `canUseTool` (`permissions.ts`) fait un aller-retour WS avant chaque outil. Le handler WS existant de `terminal.ts` gagne des branches `stream-*` qui délèguent au manager.

**Tech Stack:** TypeScript (ESM, NodeNext), `@anthropic-ai/claude-agent-sdk@0.3.205`, `ws`, `tsx`. Tests : runner natif `node:test` via `tsx` (unités pures) + scripts d'intégration (claude réel).

## Global Constraints

- **Périmètre strict** : `packages/agent/` uniquement. Ne touche NI le frontend (`src/`), NI la DB (pas de lecture/écriture `agent_sessions`), NI les settings. (Le lot 1 ne lit pas la DB.)
- **Auth = abonnement claude.ai** : l'env passé au SDK exclut toutes les clés d'auth Anthropic — `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` (sinon bascule API/proxy silencieuse) — plus `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`. `options.env` **remplace** l'environnement → spread `process.env` puis supprimer ces clés.
- **Binaire** : `options.pathToClaudeCodeExecutable = findClaude()` (depuis `./helpers.js`).
- **La session SDK survit au détachement WS** : fermer un client ne stoppe jamais l'agent.
- **Whitelist, pas blacklist** dans le mapping : on n'émet que `session`/`thinking`/`assistant`/`tool_use`/`tool_result`/`result` ; tout le reste (`system/hook_*`, `system/thinking_tokens`, `rate_limit_event`, …) est ignoré.
- **6 permission modes** supportés : `default | acceptEdits | bypassPermissions | plan | dontAsk | auto`. `default` déclenche `canUseTool`.
- **ESM** : imports relatifs avec extension `.js` (NodeNext). Fichiers de test : `*.test.ts` à côté du module.
- **Versions figées au spike** : SDK `0.3.205` ↔ CLI `2.1.205`.
- **Ne jamais commiter sans accord explicite de Ludovic** — les steps « Commit » sont préparés mais l'exécutant demande avant de les lancer.

**Spec de référence** : `docs/superpowers/specs/2026-07-08-streamed-agent-lot1-backend-design.md`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `packages/agent/src/sdk/types.ts` | Types partagés : `StreamEvent`, `PermissionDecision`, `SessionParams`. |
| `packages/agent/src/sdk/promptQueue.ts` | File async → `AsyncIterable<SDKUserMessage>` alimentée par `push()`, terminée par `close()`. |
| `packages/agent/src/sdk/mapMessage.ts` | Fonction pure `mapMessage(msg): StreamEvent[]` (whitelist). |
| `packages/agent/src/sdk/permissions.ts` | `createPermissionController(broadcast)` → `{ canUseTool, resolve, abortAll, snapshot }`. |
| `packages/agent/src/sdk/sdkAgent.ts` | Manager de sessions : `startOrAttach`, `sendUserMessage`, contrôles, `resolvePermission`, `detach`, `stop`. `query` injectable. |
| `packages/agent/src/terminal.ts` | *(modifié)* branches `stream-*` + `streamSessionId` par connexion + `detach` sur `close`. |
| `packages/agent/scripts/it-*.mjs` | Scripts d'intégration (claude réel) — reprennent le harness du spike. |
| `packages/agent/package.json` | *(modifié)* script `test`. |

---

## Task 1: Setup test + file async `promptQueue`

**Files:**
- Modify: `packages/agent/package.json` (ajout script `test`)
- Create: `packages/agent/src/sdk/promptQueue.ts`
- Test: `packages/agent/src/sdk/promptQueue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // SDKUserMessage importé du SDK ; on ne pousse que du texte.
  export interface PromptQueue {
    iterable: AsyncIterable<SDKUserMessage>;
    push(text: string): void;   // enfile { type:'user', message:{role:'user',content:text}, parent_tool_use_id:null }
    close(): void;              // termine le générateur
  }
  export function makePromptQueue(): PromptQueue;
  ```

- [ ] **Step 1: Ajouter le script `test` à `packages/agent/package.json`**

Dans `"scripts"`, ajouter :
```json
"test": "node --import tsx --test \"src/**/*.test.ts\""
```
(Node 24 supporte le glob de `--test` ; `--import tsx` charge le loader TS.)

- [ ] **Step 2: Écrire le test qui échoue**

Create `packages/agent/src/sdk/promptQueue.ts` avec un stub minimal pour que l'import résolve :
```ts
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
export interface PromptQueue {
  iterable: AsyncIterable<SDKUserMessage>;
  push(text: string): void;
  close(): void;
}
export function makePromptQueue(): PromptQueue {
  throw new Error('not implemented');
}
```

Create `packages/agent/src/sdk/promptQueue.test.ts` :
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePromptQueue } from './promptQueue.js';

test('push puis consommation restitue le message user', async () => {
  const q = makePromptQueue();
  q.push('hello');
  q.close();
  const seen: string[] = [];
  for await (const msg of q.iterable) {
    assert.equal(msg.type, 'user');
    assert.equal((msg.message as { content: string }).content, 'hello');
    assert.equal(msg.parent_tool_use_id, null);
    seen.push((msg.message as { content: string }).content);
  }
  assert.deepEqual(seen, ['hello']);
});

test('push après attente débloque le générateur (streaming)', async () => {
  const q = makePromptQueue();
  const got: string[] = [];
  const consumer = (async () => {
    for await (const msg of q.iterable) {
      got.push((msg.message as { content: string }).content);
      if (got.length === 2) q.close();
    }
  })();
  q.push('un');
  await new Promise((r) => setTimeout(r, 10)); // le consumer attend
  q.push('deux');
  await consumer;
  assert.deepEqual(got, ['un', 'deux']);
});

test('close sans message termine immédiatement', async () => {
  const q = makePromptQueue();
  q.close();
  const seen: unknown[] = [];
  for await (const m of q.iterable) seen.push(m);
  assert.equal(seen.length, 0);
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `cd packages/agent && npm test`
Expected: FAIL — `Error: not implemented`.

- [ ] **Step 4: Implémenter `makePromptQueue`**

Remplacer le corps de `packages/agent/src/sdk/promptQueue.ts` :
```ts
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

export interface PromptQueue {
  iterable: AsyncIterable<SDKUserMessage>;
  push(text: string): void;
  close(): void;
}

export function makePromptQueue(): PromptQueue {
  const queue: SDKUserMessage[] = [];
  let resolve: (() => void) | null = null;
  let done = false;

  async function* gen(): AsyncGenerator<SDKUserMessage> {
    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((r) => (resolve = r));
        continue;
      }
      yield queue.shift() as SDKUserMessage;
    }
  }

  return {
    iterable: gen(),
    push(text: string) {
      queue.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
      } as SDKUserMessage);
      resolve?.();
      resolve = null;
    },
    close() {
      done = true;
      resolve?.();
      resolve = null;
    },
  };
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `cd packages/agent && npm test`
Expected: PASS (3 tests promptQueue).

- [ ] **Step 6: Vérifier le typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 7: Commit** *(demander l'accord de Ludovic avant de lancer)*

```bash
git add packages/agent/package.json packages/agent/src/sdk/promptQueue.ts packages/agent/src/sdk/promptQueue.test.ts
git commit -m "feat(agent): async prompt queue for SDK streaming input + node:test setup"
```

---

## Task 2: Mapper `SDKMessage → StreamEvent[]`

**Files:**
- Create: `packages/agent/src/sdk/types.ts`
- Create: `packages/agent/src/sdk/mapMessage.ts`
- Test: `packages/agent/src/sdk/mapMessage.test.ts`

**Interfaces:**
- Consumes: rien (fonction pure).
- Produces:
  ```ts
  // types.ts
  export type StreamEvent =
    | { event: 'session'; data: { id: string; model: string; permissionMode: string; cwd: string; tools: string[] } }
    | { event: 'thinking'; data: { text: string } }
    | { event: 'assistant'; data: { text: string } }
    | { event: 'tool_use'; data: { id: string; name: string; input: unknown } }
    | { event: 'tool_result'; data: { tool_use_id: string; content: unknown } }
    | { event: 'result'; data: { is_error: boolean; text: string; session_id: string; num_turns: number; usage: unknown; total_cost_usd: number } };
  export type PermissionDecision = 'allow-once' | 'allow-always' | 'reject';
  // mapMessage.ts
  export function mapMessage(msg: SDKMessage): StreamEvent[];
  ```
  Un `SDKMessage` `assistant` produit **plusieurs** events (un par bloc de `content`) ; le bruit produit `[]`.

- [ ] **Step 1: Créer les types partagés**

Create `packages/agent/src/sdk/types.ts` :
```ts
export type StreamEvent =
  | { event: 'session'; data: { id: string; model: string; permissionMode: string; cwd: string; tools: string[] } }
  | { event: 'thinking'; data: { text: string } }
  | { event: 'assistant'; data: { text: string } }
  | { event: 'tool_use'; data: { id: string; name: string; input: unknown } }
  | { event: 'tool_result'; data: { tool_use_id: string; content: unknown } }
  | { event: 'result'; data: { is_error: boolean; text: string; session_id: string; num_turns: number; usage: unknown; total_cost_usd: number } };

export type PermissionDecision = 'allow-once' | 'allow-always' | 'reject';
```

- [ ] **Step 2: Écrire le test qui échoue (fixtures réelles du spike)**

Create `packages/agent/src/sdk/mapMessage.ts` (stub) :
```ts
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { StreamEvent } from './types.js';
export function mapMessage(_msg: SDKMessage): StreamEvent[] {
  throw new Error('not implemented');
}
```

Create `packages/agent/src/sdk/mapMessage.test.ts` — fixtures calquées sur les formes figées au spike :
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMessage } from './mapMessage.js';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// Helper : cast lâche (les fixtures sont des sous-ensembles des vraies formes).
const m = (o: unknown) => o as SDKMessage;

test('system/init → un event session', () => {
  const out = mapMessage(m({
    type: 'system', subtype: 'init', session_id: 's1', model: 'claude-sonnet-4-5',
    permissionMode: 'acceptEdits', cwd: '/tmp', tools: ['Read', 'Write'],
  }));
  assert.deepEqual(out, [{
    event: 'session',
    data: { id: 's1', model: 'claude-sonnet-4-5', permissionMode: 'acceptEdits', cwd: '/tmp', tools: ['Read', 'Write'] },
  }]);
});

test('bruit system (hook/thinking_tokens) → []', () => {
  assert.deepEqual(mapMessage(m({ type: 'system', subtype: 'hook_started', session_id: 's1' })), []);
  assert.deepEqual(mapMessage(m({ type: 'system', subtype: 'thinking_tokens', session_id: 's1' })), []);
  assert.deepEqual(mapMessage(m({ type: 'rate_limit_event', session_id: 's1' })), []);
});

test('assistant avec blocs thinking + text + tool_use → 3 events ordonnés', () => {
  const out = mapMessage(m({
    type: 'assistant', session_id: 's1', parent_tool_use_id: null,
    message: { role: 'assistant', content: [
      { type: 'thinking', thinking: 'réflexion', signature: 'x' },
      { type: 'text', text: 'pong' },
      { type: 'tool_use', id: 'tu1', name: 'Write', input: { path: 'a.txt' }, caller: null },
    ] },
  }));
  assert.deepEqual(out, [
    { event: 'thinking', data: { text: 'réflexion' } },
    { event: 'assistant', data: { text: 'pong' } },
    { event: 'tool_use', data: { id: 'tu1', name: 'Write', input: { path: 'a.txt' } } },
  ]);
});

test('user avec tool_result → event tool_result', () => {
  const out = mapMessage(m({
    type: 'user', session_id: 's1', parent_tool_use_id: null,
    message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'tu1', content: 'ok' },
    ] },
  }));
  assert.deepEqual(out, [{ event: 'tool_result', data: { tool_use_id: 'tu1', content: 'ok' } }]);
});

test('user texte simple (echo improbable) → [] (pas de tool_result)', () => {
  const out = mapMessage(m({
    type: 'user', session_id: 's1', parent_tool_use_id: null,
    message: { role: 'user', content: 'coucou' },
  }));
  assert.deepEqual(out, []);
});

test('result success → event result', () => {
  const out = mapMessage(m({
    type: 'result', subtype: 'success', is_error: false, result: 'Créé.',
    session_id: 's1', num_turns: 2, usage: { input_tokens: 1 }, total_cost_usd: 0.01, stop_reason: 'end_turn',
  }));
  assert.deepEqual(out, [{
    event: 'result',
    data: { is_error: false, text: 'Créé.', session_id: 's1', num_turns: 2, usage: { input_tokens: 1 }, total_cost_usd: 0.01 },
  }]);
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `cd packages/agent && npm test`
Expected: FAIL — `Error: not implemented`.

- [ ] **Step 4: Implémenter `mapMessage`**

Remplacer `packages/agent/src/sdk/mapMessage.ts` :
```ts
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { StreamEvent } from './types.js';

interface Block { type: string; [k: string]: unknown }

function blocksOf(msg: unknown): Block[] {
  const content = (msg as { message?: { content?: unknown } }).message?.content;
  return Array.isArray(content) ? (content as Block[]) : [];
}

export function mapMessage(msg: SDKMessage): StreamEvent[] {
  const anyMsg = msg as unknown as { type: string; subtype?: string; [k: string]: unknown };

  if (anyMsg.type === 'system' && anyMsg.subtype === 'init') {
    return [{
      event: 'session',
      data: {
        id: String(anyMsg.session_id ?? ''),
        model: String(anyMsg.model ?? ''),
        permissionMode: String(anyMsg.permissionMode ?? ''),
        cwd: String(anyMsg.cwd ?? ''),
        tools: Array.isArray(anyMsg.tools) ? (anyMsg.tools as string[]) : [],
      },
    }];
  }

  if (anyMsg.type === 'assistant') {
    const out: StreamEvent[] = [];
    for (const b of blocksOf(anyMsg)) {
      if (b.type === 'thinking') out.push({ event: 'thinking', data: { text: String(b.thinking ?? '') } });
      else if (b.type === 'text') out.push({ event: 'assistant', data: { text: String(b.text ?? '') } });
      else if (b.type === 'tool_use') out.push({ event: 'tool_use', data: { id: String(b.id ?? ''), name: String(b.name ?? ''), input: b.input } });
    }
    return out;
  }

  if (anyMsg.type === 'user') {
    const out: StreamEvent[] = [];
    for (const b of blocksOf(anyMsg)) {
      if (b.type === 'tool_result') out.push({ event: 'tool_result', data: { tool_use_id: String(b.tool_use_id ?? ''), content: b.content } });
    }
    return out;
  }

  if (anyMsg.type === 'result') {
    return [{
      event: 'result',
      data: {
        is_error: Boolean(anyMsg.is_error),
        text: String(anyMsg.result ?? ''),
        session_id: String(anyMsg.session_id ?? ''),
        num_turns: Number(anyMsg.num_turns ?? 0),
        usage: anyMsg.usage,
        total_cost_usd: Number(anyMsg.total_cost_usd ?? 0),
      },
    }];
  }

  return []; // tout le reste = bruit filtré
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `cd packages/agent && npm test`
Expected: PASS (tous les tests mapMessage + promptQueue).

- [ ] **Step 6: Typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 7: Commit** *(après accord)*

```bash
git add packages/agent/src/sdk/types.ts packages/agent/src/sdk/mapMessage.ts packages/agent/src/sdk/mapMessage.test.ts
git commit -m "feat(agent): pure SDKMessage -> StreamEvent mapper (whitelist)"
```

---

## Task 3: Contrôleur de permissions

**Files:**
- Create: `packages/agent/src/sdk/permissions.ts`
- Test: `packages/agent/src/sdk/permissions.test.ts`

**Interfaces:**
- Consumes: `PermissionDecision` de `./types.js`.
- Produces:
  ```ts
  export interface PendingPermission { id: string; toolName: string; input: Record<string, unknown>; title?: string; displayName?: string }
  export interface PermissionController {
    // À passer tel quel à options.canUseTool du SDK.
    canUseTool: (toolName: string, input: Record<string, unknown>, options: {
      signal?: AbortSignal; suggestions?: unknown[]; title?: string; displayName?: string;
    }) => Promise<PermissionResultLike>;
    resolve(id: string, decision: PermissionDecision): boolean; // true si résolu
    abortAll(): void;          // deny tout ce qui est en attente
    snapshot(): PendingPermission[];
  }
  // Forme minimale du PermissionResult attendu par le SDK.
  export type PermissionResultLike =
    | { behavior: 'allow'; updatedPermissions?: unknown[] }
    | { behavior: 'deny'; message: string };
  export function createPermissionController(
    broadcast: (req: PendingPermission) => void,
  ): PermissionController;
  ```
  `id` généré par compteur interne (déterministe pour les tests : `perm-1`, `perm-2`, …).

- [ ] **Step 1: Écrire le test qui échoue**

Create `packages/agent/src/sdk/permissions.ts` (stub) :
```ts
import type { PermissionDecision } from './types.js';
export interface PendingPermission { id: string; toolName: string; input: Record<string, unknown>; title?: string; displayName?: string }
export type PermissionResultLike = { behavior: 'allow'; updatedPermissions?: unknown[] } | { behavior: 'deny'; message: string };
export interface PermissionController {
  canUseTool: (toolName: string, input: Record<string, unknown>, options: { signal?: AbortSignal; suggestions?: unknown[]; title?: string; displayName?: string }) => Promise<PermissionResultLike>;
  resolve(id: string, decision: PermissionDecision): boolean;
  abortAll(): void;
  snapshot(): PendingPermission[];
}
export function createPermissionController(_broadcast: (req: PendingPermission) => void): PermissionController {
  throw new Error('not implemented');
}
```

Create `packages/agent/src/sdk/permissions.test.ts` :
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPermissionController, type PendingPermission } from './permissions.js';

test('canUseTool broadcast une requête et attend la résolution', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const p = ctrl.canUseTool('Write', { path: 'a.txt' }, { title: 'Claude wants to write a.txt', displayName: 'Write file' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].toolName, 'Write');
  assert.equal(sent[0].title, 'Claude wants to write a.txt');
  assert.deepEqual(ctrl.snapshot().map((s) => s.id), [sent[0].id]);
  const ok = ctrl.resolve(sent[0].id, 'allow-once');
  assert.equal(ok, true);
  assert.deepEqual(await p, { behavior: 'allow' });
  assert.equal(ctrl.snapshot().length, 0);
});

test('allow-always renvoie les suggestions comme updatedPermissions', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const suggestions = [{ toolName: 'Write' }];
  const p = ctrl.canUseTool('Write', {}, { suggestions });
  ctrl.resolve(sent[0].id, 'allow-always');
  assert.deepEqual(await p, { behavior: 'allow', updatedPermissions: suggestions });
});

test('reject renvoie un deny', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const p = ctrl.canUseTool('Bash', { cmd: 'rm -rf /' }, {});
  ctrl.resolve(sent[0].id, 'reject');
  const res = await p;
  assert.equal(res.behavior, 'deny');
});

test('resolve sur un id inconnu → false (idempotence)', () => {
  const ctrl = createPermissionController(() => {});
  assert.equal(ctrl.resolve('perm-999', 'allow-once'), false);
});

test('abortAll deny toutes les requêtes en attente', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const p = ctrl.canUseTool('Write', {}, {});
  ctrl.abortAll();
  const res = await p;
  assert.equal(res.behavior, 'deny');
  assert.equal(ctrl.snapshot().length, 0);
});

test('AbortSignal déjà avorté → deny immédiat sans broadcast', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const ac = new AbortController();
  ac.abort();
  const res = await ctrl.canUseTool('Write', {}, { signal: ac.signal });
  assert.equal(res.behavior, 'deny');
  assert.equal(sent.length, 0);
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd packages/agent && npm test`
Expected: FAIL — `Error: not implemented`.

- [ ] **Step 3: Implémenter `createPermissionController`**

Remplacer le corps de `packages/agent/src/sdk/permissions.ts` (garder les `interface`/`type` en tête) :
```ts
import type { PermissionDecision } from './types.js';

export interface PendingPermission { id: string; toolName: string; input: Record<string, unknown>; title?: string; displayName?: string }
export type PermissionResultLike = { behavior: 'allow'; updatedPermissions?: unknown[] } | { behavior: 'deny'; message: string };
export interface PermissionController {
  canUseTool: (toolName: string, input: Record<string, unknown>, options: { signal?: AbortSignal; suggestions?: unknown[]; title?: string; displayName?: string }) => Promise<PermissionResultLike>;
  resolve(id: string, decision: PermissionDecision): boolean;
  abortAll(): void;
  snapshot(): PendingPermission[];
}

interface Entry { req: PendingPermission; resolve: (r: PermissionResultLike) => void; suggestions?: unknown[] }

export function createPermissionController(broadcast: (req: PendingPermission) => void): PermissionController {
  const pending = new Map<string, Entry>();
  let counter = 0;

  const DENY_USER: PermissionResultLike = { behavior: 'deny', message: "Refusé par l'utilisateur" };
  const DENY_ABORT: PermissionResultLike = { behavior: 'deny', message: 'Interrompu' };

  return {
    canUseTool(toolName, input, options) {
      if (options.signal?.aborted) return Promise.resolve(DENY_ABORT);
      const id = `perm-${++counter}`;
      const req: PendingPermission = { id, toolName, input, title: options.title, displayName: options.displayName };
      return new Promise<PermissionResultLike>((resolve) => {
        pending.set(id, { req, resolve, suggestions: options.suggestions });
        options.signal?.addEventListener('abort', () => {
          if (pending.delete(id)) resolve(DENY_ABORT);
        });
        broadcast(req);
      });
    },
    resolve(id, decision) {
      const entry = pending.get(id);
      if (!entry) return false;
      pending.delete(id);
      if (decision === 'allow-once') entry.resolve({ behavior: 'allow' });
      else if (decision === 'allow-always') entry.resolve({ behavior: 'allow', updatedPermissions: entry.suggestions });
      else entry.resolve(DENY_USER);
      return true;
    },
    abortAll() {
      for (const [, entry] of pending) entry.resolve(DENY_ABORT);
      pending.clear();
    },
    snapshot() {
      return [...pending.values()].map((e) => e.req);
    },
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd packages/agent && npm test`
Expected: PASS (tous).

- [ ] **Step 5: Typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit** *(après accord)*

```bash
git add packages/agent/src/sdk/permissions.ts packages/agent/src/sdk/permissions.test.ts
git commit -m "feat(agent): permission controller (canUseTool round-trip)"
```

---

## Task 4: Manager de sessions `sdkAgent`

**Files:**
- Create: `packages/agent/src/sdk/sdkAgent.ts`
- Test: `packages/agent/src/sdk/sdkAgent.test.ts`

**Interfaces:**
- Consumes: `makePromptQueue` (T1), `mapMessage` (T2), `createPermissionController` + `PermissionDecision` (T3), `StreamEvent` (T2).
- Produces:
  ```ts
  export interface StreamSocket { send(data: string): void; readyState?: number }
  export interface StartParams {
    cwd: string; systemPrompt?: string; model?: string; effort?: string;
    permissionMode?: string; resumeClaudeSessionId?: string;
  }
  // `query` injectable pour tester sans spawn claude.
  export type QueryFn = typeof import('@anthropic-ai/claude-agent-sdk').query;
  export function createSdkAgentManager(deps?: { queryFn?: QueryFn }): {
    startOrAttach(sessionId: string, ws: StreamSocket, params: StartParams): void;
    sendUserMessage(sessionId: string, text: string): void;
    setModel(sessionId: string, model?: string): void;
    setEffort(sessionId: string, effort: string): void;
    setPermissionMode(sessionId: string, mode: string): void;
    interrupt(sessionId: string): void;
    resolvePermission(sessionId: string, id: string, decision: PermissionDecision): void;
    detach(sessionId: string, ws: StreamSocket): void;
    stop(sessionId: string): void;
    has(sessionId: string): boolean;
  };
  ```
  Messages WS émis (chaîne JSON) : `stream-ready`, `stream-event`, `stream-permission-request`, `stream-closed`, `stream-error` (formes = spec § Protocole).

**Notes d'implémentation :**
- `startOrAttach` sur session vivante → ajoute `ws` à `clients`, envoie `stream-ready { attached:true, ... , pendingPermissions }`, et **ignore** les `params` (la session garde son état).
- Sur session neuve → construit `promptQueue`, `permissionController`, appelle `queryFn({ prompt: queue.iterable, options })`, envoie `stream-ready { attached:false, ... }`, puis lance la boucle `for await` en tâche de fond (broadcast des events, capture `claudeSessionId`, `busy=false` sur `result`, `stream-closed` en fin, `stream-error` sur exception).
- `options.env` = `{ ...process.env }` moins `ANTHROPIC_API_KEY`/`CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`.
- `options.canUseTool` = `permissionController.canUseTool`.
- `broadcast` = envoyer à tous les `clients` dont `readyState` est absent ou `=== 1` (OPEN).

- [ ] **Step 1: Écrire le test qui échoue (query factice injectée)**

Create `packages/agent/src/sdk/sdkAgent.ts` (stub) :
```ts
import type { PermissionDecision } from './types.js';
export interface StreamSocket { send(data: string): void; readyState?: number }
export interface StartParams { cwd: string; systemPrompt?: string; model?: string; effort?: string; permissionMode?: string; resumeClaudeSessionId?: string }
export type QueryFn = typeof import('@anthropic-ai/claude-agent-sdk').query;
export function createSdkAgentManager(_deps?: { queryFn?: QueryFn }) {
  throw new Error('not implemented');
  return {} as never;
}
```

Create `packages/agent/src/sdk/sdkAgent.test.ts` — on injecte une `queryFn` factice qui renvoie un `Query`-like (async generator + méthodes de contrôle) :
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSdkAgentManager, type StreamSocket, type QueryFn } from './sdkAgent.js';

// Socket espion.
function fakeSocket() {
  const messages: { type: string; [k: string]: unknown }[] = [];
  const ws: StreamSocket & { messages: typeof messages } = {
    readyState: 1,
    send: (d: string) => { messages.push(JSON.parse(d)); },
    messages,
  };
  return ws;
}

// query() factice : émet une séquence figée puis se termine ; capture les setModel/interrupt.
function fakeQueryFactory() {
  const calls: { setModel: unknown[]; setPermissionMode: unknown[]; interrupt: number } = { setModel: [], setPermissionMode: [], interrupt: 0 };
  const queryFn = ((_params: { prompt: AsyncIterable<unknown>; options?: unknown }) => {
    async function* gen() {
      yield { type: 'system', subtype: 'init', session_id: 'claude-1', model: 'claude-sonnet-4-5', permissionMode: 'acceptEdits', cwd: '/tmp', tools: [] };
      yield { type: 'assistant', session_id: 'claude-1', parent_tool_use_id: null, message: { role: 'assistant', content: [{ type: 'text', text: 'pong' }] } };
      yield { type: 'result', subtype: 'success', is_error: false, result: 'pong', session_id: 'claude-1', num_turns: 1, usage: {}, total_cost_usd: 0 };
    }
    const q = gen() as AsyncGenerator<unknown> & Record<string, unknown>;
    q.setModel = async (m: unknown) => { calls.setModel.push(m); };
    q.setPermissionMode = async (m: unknown) => { calls.setPermissionMode.push(m); };
    q.interrupt = async () => { calls.interrupt++; };
    return q;
  }) as unknown as QueryFn;
  return { queryFn, calls };
}

test('startOrAttach neuf → stream-ready(attached:false) puis events mappés + result', async () => {
  const { queryFn } = fakeQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  const ws = fakeSocket();
  mgr.startOrAttach('sess-1', ws, { cwd: '/tmp' });
  await new Promise((r) => setTimeout(r, 30)); // laisser la boucle for-await tourner

  const types = ws.messages.map((m) => m.type);
  assert.ok(types.includes('stream-ready'));
  const ready = ws.messages.find((m) => m.type === 'stream-ready')!;
  assert.equal(ready.attached, false);

  const events = ws.messages.filter((m) => m.type === 'stream-event').map((m) => (m.event as string));
  assert.deepEqual(events, ['session', 'assistant', 'result']);
  assert.ok(ws.messages.some((m) => m.type === 'stream-closed'));
});

test('ré-attache sur session vivante → stream-ready(attached:true)', async () => {
  // query factice qui ne se termine jamais (bloque sur un prompt vide).
  const queryFn = ((_p: unknown) => {
    async function* gen() { await new Promise(() => {}); yield 0 as unknown; }
    const q = gen() as AsyncGenerator<unknown> & Record<string, unknown>;
    q.interrupt = async () => {}; q.setModel = async () => {}; q.setPermissionMode = async () => {};
    return q;
  }) as unknown as QueryFn;
  const mgr = createSdkAgentManager({ queryFn });
  const a = fakeSocket();
  mgr.startOrAttach('sess-2', a, { cwd: '/tmp' });
  const b = fakeSocket();
  mgr.startOrAttach('sess-2', b, { cwd: '/tmp' });
  const ready = b.messages.find((m) => m.type === 'stream-ready')!;
  assert.equal(ready.attached, true);
  mgr.stop('sess-2');
});

test('setModel / interrupt délèguent à Query', async () => {
  // query factice NON-terminante → la session reste vivante pour recevoir les
  // contrôles (une query qui se termine déclencherait le cleanup `sessions.delete`
  // avant l'appel à setModel/interrupt).
  const calls = { setModel: [] as unknown[], setPermissionMode: [] as unknown[], interrupt: 0 };
  const queryFn = ((_p: unknown) => {
    async function* gen() { await new Promise(() => {}); yield 0 as unknown; }
    const q = gen() as AsyncGenerator<unknown> & Record<string, unknown>;
    q.setModel = async (m: unknown) => { calls.setModel.push(m); };
    q.setPermissionMode = async (m: unknown) => { calls.setPermissionMode.push(m); };
    q.interrupt = async () => { calls.interrupt++; };
    return q;
  }) as unknown as QueryFn;
  const mgr = createSdkAgentManager({ queryFn });
  const ws = fakeSocket();
  mgr.startOrAttach('sess-3', ws, { cwd: '/tmp' });
  await new Promise((r) => setTimeout(r, 5));
  mgr.setModel('sess-3', 'claude-opus-4-6');
  mgr.interrupt('sess-3');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(calls.setModel, ['claude-opus-4-6']);
  assert.equal(calls.interrupt, 1);
  mgr.stop('sess-3');
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd packages/agent && npm test`
Expected: FAIL — `Error: not implemented`.

- [ ] **Step 3: Implémenter `createSdkAgentManager`**

Remplacer `packages/agent/src/sdk/sdkAgent.ts` :
```ts
import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import { findClaude } from '../helpers.js';
import { makePromptQueue, type PromptQueue } from './promptQueue.js';
import { mapMessage } from './mapMessage.js';
import { createPermissionController, type PermissionController, type PendingPermission } from './permissions.js';
import type { PermissionDecision } from './types.js';

export interface StreamSocket { send(data: string): void; readyState?: number }
export interface StartParams { cwd: string; systemPrompt?: string; model?: string; effort?: string; permissionMode?: string; resumeClaudeSessionId?: string }
export type QueryFn = typeof realQuery;

interface QueryLike extends AsyncIterable<unknown> {
  setModel?(model?: string): Promise<void>;
  setPermissionMode?(mode: string): Promise<void>;
  applyFlagSettings?(settings: unknown): Promise<void>;
  interrupt?(): Promise<unknown>;
  return?(v?: unknown): Promise<IteratorResult<unknown>>;
}

interface SessionState {
  q: QueryLike;
  queue: PromptQueue;
  perms: PermissionController;
  clients: Set<StreamSocket>;
  claudeSessionId: string | null;
  model: string; effort: string; permissionMode: string;
  busy: boolean;
}

function cleanEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

export function createSdkAgentManager(deps?: { queryFn?: QueryFn }) {
  const queryFn = deps?.queryFn ?? realQuery;
  const sessions = new Map<string, SessionState>();

  function send(ws: StreamSocket, payload: unknown) {
    if (ws.readyState === undefined || ws.readyState === 1) {
      try { ws.send(JSON.stringify(payload)); } catch { /* socket mort */ }
    }
  }
  function broadcast(s: SessionState, payload: unknown) {
    for (const ws of s.clients) send(ws, payload);
  }
  function readyPayload(s: SessionState, attached: boolean) {
    return {
      type: 'stream-ready',
      attached,
      claudeSessionId: s.claudeSessionId,
      model: s.model, effort: s.effort, permissionMode: s.permissionMode,
      busy: s.busy,
      pendingPermissions: s.perms.snapshot(),
    };
  }

  async function runLoop(sessionId: string, s: SessionState) {
    try {
      for await (const msg of s.q) {
        for (const ev of mapMessage(msg as never)) {
          if (ev.event === 'session') s.claudeSessionId = ev.data.id;
          if (ev.event === 'result') s.busy = false;
          broadcast(s, { type: 'stream-event', ...ev });
        }
      }
      broadcast(s, { type: 'stream-closed', reason: 'generator-ended' });
    } catch (err) {
      broadcast(s, { type: 'stream-error', message: err instanceof Error ? err.message : String(err), fatal: true });
    } finally {
      s.perms.abortAll();
      sessions.delete(sessionId);
    }
  }

  return {
    has(sessionId: string) { return sessions.has(sessionId); },

    startOrAttach(sessionId: string, ws: StreamSocket, params: StartParams) {
      const existing = sessions.get(sessionId);
      if (existing) {
        existing.clients.add(ws);
        send(ws, readyPayload(existing, true));
        return;
      }
      const queue = makePromptQueue();
      const s: SessionState = {
        q: undefined as unknown as QueryLike,
        queue,
        perms: createPermissionController((req: PendingPermission) => broadcast(s, { type: 'stream-permission-request', ...req })),
        clients: new Set([ws]),
        claudeSessionId: null,
        model: params.model ?? '', effort: params.effort ?? '', permissionMode: params.permissionMode ?? 'acceptEdits',
        busy: false,
      };
      const options: Record<string, unknown> = {
        cwd: params.cwd,
        pathToClaudeCodeExecutable: findClaude(),
        env: cleanEnv(),
        permissionMode: s.permissionMode,
        canUseTool: s.perms.canUseTool,
      };
      if (params.model) options.model = params.model;
      if (params.effort) options.effort = params.effort;
      if (params.systemPrompt) options.systemPrompt = params.systemPrompt;
      if (params.resumeClaudeSessionId) options.resume = params.resumeClaudeSessionId;

      s.q = queryFn({ prompt: queue.iterable, options } as never) as unknown as QueryLike;
      sessions.set(sessionId, s);
      send(ws, readyPayload(s, false));
      void runLoop(sessionId, s);
    },

    sendUserMessage(sessionId: string, text: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.busy = true;
      s.queue.push(text);
    },
    setModel(sessionId: string, model?: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.model = model ?? '';
      void s.q.setModel?.(model);
    },
    setEffort(sessionId: string, effort: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.effort = effort;
      // Pas de q.setEffort ; on tente applyFlagSettings (à valider en intégration).
      void s.q.applyFlagSettings?.({ effort });
    },
    setPermissionMode(sessionId: string, mode: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.permissionMode = mode;
      void s.q.setPermissionMode?.(mode);
    },
    interrupt(sessionId: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.perms.abortAll();
      void s.q.interrupt?.();
    },
    resolvePermission(sessionId: string, id: string, decision: PermissionDecision) {
      sessions.get(sessionId)?.perms.resolve(id, decision);
    },
    detach(sessionId: string, ws: StreamSocket) {
      sessions.get(sessionId)?.clients.delete(ws);
    },
    stop(sessionId: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.perms.abortAll();
      s.queue.close();
      void s.q.return?.();
      broadcast(s, { type: 'stream-closed', reason: 'stopped' });
      sessions.delete(sessionId);
    },
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd packages/agent && npm test`
Expected: PASS (tous, dont les 3 sdkAgent).

- [ ] **Step 5: Typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit** *(après accord)*

```bash
git add packages/agent/src/sdk/sdkAgent.ts packages/agent/src/sdk/sdkAgent.test.ts
git commit -m "feat(agent): SDK session manager (query injectable, broadcast, controls)"
```

---

## Task 5: Câblage WebSocket dans `terminal.ts`

**Files:**
- Modify: `packages/agent/src/terminal.ts`

**Interfaces:**
- Consumes: `createSdkAgentManager` (T4).
- Produces: le serveur WS route désormais les messages `stream-*` (voir spec § Protocole) vers un manager singleton, et retire le socket de la session sur `close`.

- [ ] **Step 1: Importer le manager et l'instancier en singleton**

Dans `packages/agent/src/terminal.ts`, après les imports existants, ajouter :
```ts
import { createSdkAgentManager } from './sdk/sdkAgent.js';

// Manager de sessions Agent SDK, partagé par toutes les connexions WS.
const sdkAgent = createSdkAgentManager();
```

- [ ] **Step 2: Étendre le type des messages entrants**

Remplacer la ligne `type ClientMessage = InitMessage | InputMessage | ResizeMessage | ListSessionsMessage;` par l'ajout des messages stream, définis juste avant :
```ts
interface StreamInitMessage {
  type: 'stream-init';
  sessionId: string; cwd: string; systemPrompt?: string;
  model?: string; effort?: string; permissionMode?: string; resumeClaudeSessionId?: string;
}
interface StreamUserMessage { type: 'stream-user-message'; sessionId: string; text: string }
interface StreamSetModelMessage { type: 'stream-set-model'; sessionId: string; model?: string }
interface StreamSetEffortMessage { type: 'stream-set-effort'; sessionId: string; effort: string }
interface StreamSetModeMessage { type: 'stream-set-mode'; sessionId: string; permissionMode: string }
interface StreamInterruptMessage { type: 'stream-interrupt'; sessionId: string }
interface StreamStopMessage { type: 'stream-stop'; sessionId: string }
interface StreamPermissionResponseMessage { type: 'stream-permission-response'; sessionId: string; id: string; decision: 'allow-once' | 'allow-always' | 'reject' }

type ClientMessage =
  | InitMessage | InputMessage | ResizeMessage | ListSessionsMessage
  | StreamInitMessage | StreamUserMessage | StreamSetModelMessage | StreamSetEffortMessage
  | StreamSetModeMessage | StreamInterruptMessage | StreamStopMessage | StreamPermissionResponseMessage;
```

- [ ] **Step 3: Ajouter l'état par connexion + les branches de routage**

Dans le handler `wss.on('connection', (ws) => { ... })`, juste après `let initReady: Promise<void> | null = null;`, ajouter :
```ts
let streamSessionId: string | null = null;
```

Dans `ws.on('message', ...)`, **avant** la branche `if (msg.type === 'init')`, insérer le routage stream (ces messages ne touchent pas le `pty`) :
```ts
if (msg.type === 'stream-init') {
  streamSessionId = msg.sessionId;
  sdkAgent.startOrAttach(msg.sessionId, ws, {
    cwd: msg.cwd, systemPrompt: msg.systemPrompt, model: msg.model,
    effort: msg.effort, permissionMode: msg.permissionMode,
    resumeClaudeSessionId: msg.resumeClaudeSessionId,
  });
  return;
}
if (msg.type === 'stream-user-message') { sdkAgent.sendUserMessage(msg.sessionId, msg.text); return; }
if (msg.type === 'stream-set-model') { sdkAgent.setModel(msg.sessionId, msg.model); return; }
if (msg.type === 'stream-set-effort') { sdkAgent.setEffort(msg.sessionId, msg.effort); return; }
if (msg.type === 'stream-set-mode') { sdkAgent.setPermissionMode(msg.sessionId, msg.permissionMode); return; }
if (msg.type === 'stream-interrupt') { sdkAgent.interrupt(msg.sessionId); return; }
if (msg.type === 'stream-stop') { sdkAgent.stop(msg.sessionId); return; }
if (msg.type === 'stream-permission-response') { sdkAgent.resolvePermission(msg.sessionId, msg.id, msg.decision); return; }
```

- [ ] **Step 4: Détacher le socket au `close`**

Dans `ws.on('close', () => { ... })`, ajouter au début du corps (avant la logique `pty`) :
```ts
if (streamSessionId) {
  sdkAgent.detach(streamSessionId, ws);
  streamSessionId = null;
}
```

- [ ] **Step 5: Typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: aucune erreur (les tests unitaires précédents passent toujours : `npm test`).

- [ ] **Step 6: Commit** *(après accord)*

```bash
git add packages/agent/src/terminal.ts
git commit -m "feat(agent): route stream-* WebSocket messages to SDK session manager"
```

---

## Task 6: Scripts d'intégration (claude réel)

**Files:**
- Create: `packages/agent/scripts/it-single-turn.mjs`
- Create: `packages/agent/scripts/it-permission.mjs`
- Modify: `packages/agent/spike-sdk-shape.mjs` → déplacer en `packages/agent/scripts/spike-sdk-shape.mjs` (rangement)

**But :** couvrir les points 2–7 de la stratégie de test de la spec, qui nécessitent un vrai `claude` (pas automatisables en unit test). Ces scripts démarrent le serveur agent en tâche de fond puis parlent au WebSocket `ws://localhost:4001`.

**Prérequis runtime :** `claude` installé + `claude login` fait ; `ANTHROPIC_API_KEY` absent de l'env.

- [ ] **Step 1: Ranger le script de spike**

```bash
mkdir -p packages/agent/scripts
git mv packages/agent/spike-sdk-shape.mjs packages/agent/scripts/spike-sdk-shape.mjs 2>/dev/null || mv packages/agent/spike-sdk-shape.mjs packages/agent/scripts/spike-sdk-shape.mjs
```

- [ ] **Step 2: Script tour unique + multi-tours + contrôles**

Create `packages/agent/scripts/it-single-turn.mjs` :
```js
/**
 * Intégration : lance le serveur agent, ouvre un WebSocket, exerce
 * stream-init → stream-user-message → assistant+result, puis un 2e tour
 * sur la même session (persistance). Sortie non-zéro si un assert échoue.
 *
 * Usage : node packages/agent/scripts/it-single-turn.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 4599;
const cwd = mkdtempSync(join(tmpdir(), 'devora-it-'));
const server = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, DEVORA_AGENT_PORT: String(PORT) },
  stdio: 'inherit',
});
const done = (code) => { server.kill('SIGTERM'); process.exit(code); };
process.on('exit', () => server.kill('SIGTERM'));

await new Promise((r) => setTimeout(r, 1500)); // laisser le serveur écouter

const ws = new WebSocket(`ws://localhost:${PORT}`);
const events = [];
let results = 0;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'stream-init', sessionId: 'it-1', cwd, permissionMode: 'plan', model: 'claude-sonnet-4-5' }));
  ws.send(JSON.stringify({ type: 'stream-user-message', sessionId: 'it-1', text: 'Réponds exactement: pong' }));
});
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'stream-event') events.push(m.event);
  if (m.type === 'stream-event' && m.event === 'result') {
    results++;
    if (results === 1) {
      // 2e tour, même session
      ws.send(JSON.stringify({ type: 'stream-user-message', sessionId: 'it-1', text: 'Réponds exactement: ping' }));
    } else {
      console.log('[it] events:', events.join(','));
      const ok = events.includes('session') && events.filter((e) => e === 'result').length === 2 && events.includes('assistant');
      console.log(ok ? '[it] OK tour unique + multi-tours' : '[it] ÉCHEC');
      ws.close();
      done(ok ? 0 : 1);
    }
  }
});
ws.on('error', (e) => { console.error('[it] ws error', e.message); done(1); });
setTimeout(() => { console.error('[it] timeout'); done(1); }, 120_000);
```

- [ ] **Step 3: Lancer le script tour unique/multi-tours**

Run: `cd packages/agent && node scripts/it-single-turn.mjs`
Expected: log `[it] OK tour unique + multi-tours` et code de sortie 0 ; `events` contient `session`, `assistant`, et 2× `result`.

- [ ] **Step 4: Script flux de permission (mode default)**

Create `packages/agent/scripts/it-permission.mjs` :
```js
/**
 * Intégration : en permissionMode 'default', une demande d'écriture doit
 * déclencher stream-permission-request ; on répond allow-once et on attend
 * le result. Sortie non-zéro si pas de permission-request observée.
 *
 * Usage : node packages/agent/scripts/it-permission.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 4598;
const cwd = mkdtempSync(join(tmpdir(), 'devora-itp-'));
const server = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, DEVORA_AGENT_PORT: String(PORT) },
  stdio: 'inherit',
});
const done = (code) => { server.kill('SIGTERM'); process.exit(code); };
process.on('exit', () => server.kill('SIGTERM'));
await new Promise((r) => setTimeout(r, 1500));

const ws = new WebSocket(`ws://localhost:${PORT}`);
let sawPermission = false;
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'stream-init', sessionId: 'itp-1', cwd, permissionMode: 'default', model: 'claude-sonnet-4-5' }));
  ws.send(JSON.stringify({ type: 'stream-user-message', sessionId: 'itp-1', text: "Crée un fichier a.txt contenant 'ok' dans le répertoire courant." }));
});
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'stream-permission-request') {
    sawPermission = true;
    console.log('[itp] permission-request:', m.toolName ?? m.displayName);
    ws.send(JSON.stringify({ type: 'stream-permission-response', sessionId: 'itp-1', id: m.id, decision: 'allow-once' }));
  }
  if (m.type === 'stream-event' && m.event === 'result') {
    console.log(sawPermission ? '[itp] OK flux de permission' : '[itp] ÉCHEC (pas de permission-request)');
    ws.close();
    done(sawPermission ? 0 : 1);
  }
});
ws.on('error', (e) => { console.error('[itp] ws error', e.message); done(1); });
setTimeout(() => { console.error('[itp] timeout'); done(1); }, 120_000);
```

- [ ] **Step 5: Lancer le script permission**

Run: `cd packages/agent && node scripts/it-permission.mjs`
Expected: log `[itp] permission-request: Write` (ou displayName équivalent) puis `[itp] OK flux de permission`, code de sortie 0.

- [ ] **Step 6: Commit** *(après accord)*

```bash
git add packages/agent/scripts/
git commit -m "test(agent): integration scripts for stream turns + permission flow"
```

---

## Self-Review (fait à l'écriture)

**Couverture spec ↔ tâches :**
- File async (§ Alimenter le prompt) → T1.
- Mapping `SDKMessage → stream-event` (§ Mapping, whitelist, thinking/tool_use/tool_result/result) → T2.
- Flux de permission Option B (§ Flux de permission) → T3 (contrôleur) + T5 (routage `stream-permission-response`) + T6 (intégration `default`).
- Manager de sessions, `startOrAttach`/`sendUserMessage`/contrôles/`detach`/`stop`, boucle streaming, `stream-ready`/`stream-closed`/`stream-error`, env nettoyé, `findClaude`, capture `claudeSessionId`, `busy` (§ Architecture / API interne / Boucle) → T4.
- Câblage protocole WS dans `terminal.ts` (§ Protocole) → T5.
- Stratégie de test points 2–7 → T6 (spike point 1 déjà fait).

**Points hors périmètre respectés :** aucune tâche ne touche `src/`, la DB (`agent_sessions`), ni les settings — conforme à la contrainte globale. Le `systemPrompt` est passé tel quel (composition = lot 2).

**Écarts assumés à surveiller à l'exécution :**
- `setEffort` : `applyFlagSettings({ effort })` est une supposition non vérifiée au spike (cf. risque spec). Si le SDK la rejette, dégrader en no-op côté lot 1 et laisser le lot 2 recréer la session — ne pas bloquer T4.
- Ré-affichage des permissions en attente à la ré-attache : couvert par `pendingPermissions` dans `stream-ready` (T4) ; pas de step d'intégration dédié (nécessiterait 2 clients + un tour en cours) — vérification manuelle si besoin.

---

## Execution Handoff

Voir la fin de la conversation pour le choix du mode d'exécution.
