import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { createSdkAgentManager, type StreamSocket, type QueryFn } from './sdkAgent.js';
import * as transcript from './transcriptStore.js';
import { __setDbForTests, __resetDbForTests } from '../db.js';

// DB en mémoire injectée dans transcriptStore pour isoler les tests de persistance
// (seq/appendEvent/loadTranscript) de la vraie DB SQLite de l'app.
let memDb: Database.Database;
beforeEach(() => {
  memDb = new Database(':memory:');
  memDb.exec(`CREATE TABLE agent_chat_messages (
    id TEXT PRIMARY KEY, agent_session_id TEXT NOT NULL, seq INTEGER NOT NULL,
    role TEXT NOT NULL, event_type TEXT NOT NULL, content TEXT, created_at TEXT);`);
  memDb.exec(`CREATE TABLE agent_sessions (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, claude_session_id TEXT);`);
  memDb.exec(`CREATE TABLE agent_activity_logs (
    id TEXT PRIMARY KEY, agent_session_id TEXT NOT NULL, content TEXT, log_type TEXT, created_at TEXT);`);
  memDb.exec(`CREATE TABLE notifications (
    id TEXT PRIMARY KEY, source TEXT, type TEXT, priority TEXT, title TEXT, body TEXT,
    url TEXT, entity_ref TEXT, payload TEXT, dedupe_key TEXT UNIQUE,
    read_at TEXT, created_at TEXT DEFAULT (datetime('now')));`);
  transcript.__setDbForTests(memDb);
  __setDbForTests(memDb);
});

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

test('env passé au SDK: spread de process.env sans les clés sensibles', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-should-be-stripped';
  process.env.CLAUDECODE = '1';
  process.env.CLAUDE_CODE_ENTRYPOINT = 'cli';
  process.env.ANTHROPIC_AUTH_TOKEN = 'tok-should-be-stripped';
  process.env.ANTHROPIC_BASE_URL = 'https://proxy.example';
  let captured: Record<string, unknown> | undefined;
  const queryFn = ((params: { options?: { env?: Record<string, unknown> } }) => {
    captured = params.options?.env;
    async function* gen() { await new Promise(() => {}); yield 0 as unknown; }
    const q = gen() as AsyncGenerator<unknown> & Record<string, unknown>;
    q.interrupt = async () => {}; q.setModel = async () => {}; q.setPermissionMode = async () => {};
    return q;
  }) as unknown as QueryFn;
  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('sess-env', fakeSocket(), { cwd: '/tmp' });
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(captured, 'options.env doit être passé');
  assert.equal(captured.ANTHROPIC_API_KEY, undefined);
  assert.equal(captured.CLAUDECODE, undefined);
  assert.equal(captured.CLAUDE_CODE_ENTRYPOINT, undefined);
  assert.equal(captured.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(captured.ANTHROPIC_BASE_URL, undefined);
  assert.ok('PATH' in captured, 'PATH doit survivre (spread de process.env)');
  mgr.stop('sess-env');
  delete process.env.ANTHROPIC_API_KEY; delete process.env.CLAUDECODE; delete process.env.CLAUDE_CODE_ENTRYPOINT; delete process.env.ANTHROPIC_AUTH_TOKEN; delete process.env.ANTHROPIC_BASE_URL;
});

test('défaut: mode bypassPermissions + allowDangerouslySkipPermissions passés au SDK', async () => {
  let opts: Record<string, unknown> | undefined;
  const queryFn = ((params: { options?: Record<string, unknown> }) => {
    opts = params.options;
    async function* gen() { await new Promise(() => {}); yield 0 as unknown; }
    const q = gen() as AsyncGenerator<unknown> & Record<string, unknown>;
    q.interrupt = async () => {}; q.setModel = async () => {}; q.setPermissionMode = async () => {};
    return q;
  }) as unknown as QueryFn;
  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('sess-bypass', fakeSocket(), { cwd: '/tmp' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(opts?.permissionMode, 'bypassPermissions');
  assert.equal(opts?.allowDangerouslySkipPermissions, true);
  mgr.stop('sess-bypass');
});

test('les stream-event portent un seq croissant et sont persistés dans le transcript', async () => {
  const { queryFn } = fakeQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  const ws = fakeSocket();
  mgr.startOrAttach('sess-seq', ws, { cwd: '/tmp' });
  await new Promise((r) => setTimeout(r, 30));

  const streamEvents = ws.messages.filter((m) => m.type === 'stream-event');
  const seqs = streamEvents.map((m) => m.seq as number);
  assert.deepEqual(seqs, [1, 2, 3]);

  const persisted = transcript.loadTranscript('sess-seq');
  assert.deepEqual(persisted.map((p) => p.seq), [1, 2, 3]);
  assert.deepEqual(persisted.map((p) => p.event.event), ['session', 'assistant', 'result']);
});

test('stream-history est envoyé avant stream-ready, à la création comme à la ré-attache', async () => {
  const queryFn = ((_p: unknown) => {
    async function* gen() { await new Promise(() => {}); yield 0 as unknown; }
    const q = gen() as AsyncGenerator<unknown> & Record<string, unknown>;
    q.interrupt = async () => {}; q.setModel = async () => {}; q.setPermissionMode = async () => {};
    return q;
  }) as unknown as QueryFn;
  const mgr = createSdkAgentManager({ queryFn });

  const a = fakeSocket();
  mgr.startOrAttach('sess-history', a, { cwd: '/tmp' });
  const aTypes = a.messages.map((m) => m.type);
  assert.deepEqual(aTypes.slice(0, 2), ['stream-history', 'stream-ready']);

  const b = fakeSocket();
  mgr.startOrAttach('sess-history', b, { cwd: '/tmp' });
  const bTypes = b.messages.map((m) => m.type);
  assert.deepEqual(bTypes, ['stream-history', 'stream-ready']);
  assert.equal(b.messages[1].attached, true);

  mgr.stop('sess-history');
});

test('Task 4 : persistClaudeSessionId et writeActivityLog écrivent dans la DB injectée (:memory:)', async () => {
  // Les helpers internes de sdkAgent (persistClaudeSessionId/readClaudeSessionId/writeActivityLog)
  // appellent getDb() directement (../db.js), pas transcript.__setDbForTests. On injecte donc
  // aussi la DB de test via le hook de db.js, scoppé à ce seul test pour ne pas affecter les
  // tests lot 1 (qui n'attendent aucune DB).
  const sessionRowId = randomUUID();
  memDb
    .prepare('INSERT INTO agent_sessions (id, session_id, claude_session_id) VALUES (?, ?, NULL)')
    .run(sessionRowId, 'sess-db');
  __setDbForTests(memDb);
  try {
    const queryFn = ((_p: unknown) => {
      async function* gen() {
        yield { type: 'system', subtype: 'init', session_id: 'claude-db-1', model: 'm', permissionMode: 'acceptEdits', cwd: '/tmp', tools: [] };
        yield {
          type: 'assistant',
          session_id: 'claude-db-1',
          parent_tool_use_id: null,
          message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu-1', name: 'Edit', input: { file_path: '/tmp/foo.ts' } }] },
        };
        yield { type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 'claude-db-1', num_turns: 1, usage: {}, total_cost_usd: 0 };
      }
      const q = gen() as AsyncGenerator<unknown> & Record<string, unknown>;
      q.setModel = async () => {}; q.setPermissionMode = async () => {}; q.interrupt = async () => {};
      return q;
    }) as unknown as QueryFn;
    const mgr = createSdkAgentManager({ queryFn });
    const ws = fakeSocket();
    mgr.startOrAttach('sess-db', ws, { cwd: '/tmp' });
    await new Promise((r) => setTimeout(r, 30));

    const sessionRow = memDb
      .prepare('SELECT claude_session_id AS c FROM agent_sessions WHERE session_id = ?')
      .get('sess-db') as { c: string | null } | undefined;
    assert.equal(sessionRow?.c, 'claude-db-1');

    const logRow = memDb
      .prepare("SELECT content FROM agent_activity_logs WHERE agent_session_id = ? AND log_type = 'file_change'")
      .get(sessionRowId) as { content: string } | undefined;
    assert.ok(logRow, 'un log file_change doit être écrit dans la DB injectée');
    assert.equal(logRow?.content, '/tmp/foo.ts');
  } finally {
    __resetDbForTests();
  }
});

// Consomme le prompt-iterable du SDK et enregistre le texte de chaque tour user reçu.
function captureQueryFactory() {
  const received: string[] = [];
  const queryFn = ((params: { prompt: AsyncIterable<{ message?: { content?: unknown } }> }) => {
    async function* gen() {
      for await (const m of params.prompt) {
        const content = m?.message?.content;
        received.push(typeof content === 'string' ? content : JSON.stringify(content));
      }
    }
    const q = gen() as AsyncGenerator<unknown> & Record<string, unknown>;
    q.interrupt = async () => {}; q.setModel = async () => {}; q.setPermissionMode = async () => {};
    return q;
  }) as unknown as QueryFn;
  return { queryFn, received };
}

test('reprise: retryLastUser relance le dernier prompt user via la queue, sans dupliquer le transcript', async () => {
  transcript.appendEvent('sess-retry', 1, 'user', { event: 'user', data: { text: 'continue le travail' } });
  const { queryFn, received } = captureQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  const ws = fakeSocket();
  mgr.startOrAttach('sess-retry', ws, { cwd: '/tmp', retryLastUser: true });
  await new Promise((r) => setTimeout(r, 30));

  assert.deepEqual(received, ['continue le travail']);
  // Pas de bulle dupliquée : aucun stream-event 'user' émis, transcript inchangé.
  const userEvents = ws.messages.filter((m) => m.type === 'stream-event' && m.event === 'user');
  assert.equal(userEvents.length, 0);
  const persisted = transcript.loadTranscript('sess-retry');
  assert.equal(persisted.filter((p) => p.event.event === 'user').length, 1);
  mgr.stop('sess-retry');
});

test('reprise: sans le flag retryLastUser, aucun prompt n’est relancé', async () => {
  transcript.appendEvent('sess-noretry', 1, 'user', { event: 'user', data: { text: 'ne pas relancer' } });
  const { queryFn, received } = captureQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('sess-noretry', fakeSocket(), { cwd: '/tmp' });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(received, []);
  mgr.stop('sess-noretry');
});

// query factice « longue vie » : émet session+result immédiatement (comme une reprise
// `resume` du SDK), puis reste vivante en consommant la queue et en émettant un result
// par prompt reçu. Chaque restart (switch de persona) recrée une instance qui ré-émet
// un result de reprise — c'est ce result qui, sans garde, déclencherait l'auto-rename.
function longLivedResultQueryFactory() {
  const resultEvent = { type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 'claude-x', num_turns: 1, usage: {}, total_cost_usd: 0 };
  const queryFn = ((params: { prompt: AsyncIterable<unknown> }) => {
    async function* gen() {
      yield { type: 'system', subtype: 'init', session_id: 'claude-x', model: 'm', permissionMode: 'bypassPermissions', cwd: '/tmp', tools: [] };
      yield resultEvent;
      for await (const _ of params.prompt) { void _; yield resultEvent; }
    }
    const q = gen() as AsyncGenerator<unknown> & Record<string, unknown>;
    q.setModel = async () => {}; q.setPermissionMode = async () => {}; q.interrupt = async () => {};
    return q;
  }) as unknown as QueryFn;
  return { queryFn };
}

test('switch de persona ne déclenche pas l’auto-rename ; un vrai message le ré-arme (issue #122)', async () => {
  // agent_sessions doit exposer branch/worktree_path (colonnes lues par readSessionRow).
  memDb.exec('ALTER TABLE agent_sessions ADD COLUMN branch TEXT');
  memDb.exec('ALTER TABLE agent_sessions ADD COLUMN worktree_path TEXT');
  // worktree_path NULL → maybeStartAutoRename sort avant tout appel git, mais APRÈS le
  // hook onAutoRenameAttempt : on observe donc uniquement la décision « tenter ou non ».
  memDb.prepare("INSERT INTO agent_sessions (id, session_id, branch, worktree_path) VALUES (?, 'sess-persona', 'wip-foo', NULL)")
    .run(randomUUID());
  __setDbForTests(memDb);
  try {
    const attempts: string[] = [];
    const { queryFn } = longLivedResultQueryFactory();
    const mgr = createSdkAgentManager({ queryFn, onAutoRenameAttempt: (id) => attempts.push(id) });
    mgr.startOrAttach('sess-persona', fakeSocket(), { cwd: '/tmp' });
    await new Promise((r) => setTimeout(r, 30));
    const afterStart = attempts.length;
    assert.ok(afterStart >= 1, 'le result initial laisse une chance à l’auto-rename');

    // Switch de persona (session idle) : restart → result de reprise. NE DOIT PAS
    // relancer l’auto-rename.
    mgr.setSystemPrompt('sess-persona', 'nouveau system prompt', 'Architecte Back-end');
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(attempts.length, afterStart, 'un switch de rôle ne doit pas tenter l’auto-rename');

    // Un vrai message utilisateur ré-arme l’auto-rename.
    mgr.sendUserMessage('sess-persona', 'fais avancer la tâche');
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(attempts.length > afterStart, 'un vrai message utilisateur doit ré-armer l’auto-rename');
    mgr.stop('sess-persona');
  } finally {
    __resetDbForTests();
  }
});

test('reprise: retryLastUser mais dernier event = assistant → aucune relance', async () => {
  transcript.appendEvent('sess-answered', 1, 'user', { event: 'user', data: { text: 'demande' } });
  transcript.appendEvent('sess-answered', 2, 'assistant', { event: 'assistant', data: { text: 'réponse' } });
  const { queryFn, received } = captureQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('sess-answered', fakeSocket(), { cwd: '/tmp', retryLastUser: true });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(received, []);
  mgr.stop('sess-answered');
});

test('une session doc est exclue de listActive', () => {
  const { queryFn } = fakeQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('doc-1', fakeSocket(), { cwd: '/tmp', isDocSession: true });
  mgr.startOrAttach('sess-2', fakeSocket(), { cwd: '/tmp' });
  assert.deepEqual(mgr.listActive().map((s) => s.sessionId), ['sess-2']);
});

test('les setters sont inertes sur une session doc', () => {
  const { queryFn, calls } = fakeQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('doc-1', fakeSocket(), {
    cwd: '/tmp',
    isDocSession: true,
    permissionMode: 'bypassPermissions',
  });
  mgr.setPermissionMode('doc-1', 'default');
  mgr.setModel('doc-1', 'claude-haiku-4-5');
  mgr.setSystemPrompt('doc-1', 'tu es un pirate');
  // Aucun appel n'atteint le query SDK : les réglages d'une session doc sont
  // construits serveur et ne sont pas pilotables depuis le client.
  assert.deepEqual(calls.setPermissionMode, []);
  assert.deepEqual(calls.setModel, []);
});

test('les setters restent actifs sur une session normale', () => {
  const { queryFn, calls } = fakeQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('sess-1', fakeSocket(), { cwd: '/tmp' });
  mgr.setPermissionMode('sess-1', 'default');
  assert.deepEqual(calls.setPermissionMode, ['default']);
});

test('aucune notification pour une session doc', async () => {
  const { queryFn } = fakeQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('doc-1', fakeSocket(), { cwd: '/tmp', isDocSession: true });
  await new Promise((r) => setTimeout(r, 30));
  const { n } = memDb.prepare('SELECT count(*) AS n FROM notifications').get() as { n: number };
  assert.equal(n, 0);
});

test('une session normale émet bien sa notification de fin', async () => {
  const { queryFn } = fakeQueryFactory();
  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('sess-1', fakeSocket(), { cwd: '/tmp' });
  await new Promise((r) => setTimeout(r, 30));
  const { n } = memDb.prepare('SELECT count(*) AS n FROM notifications').get() as { n: number };
  assert.ok(n > 0, 'non-régression : le Workbench notifie toujours');
});

test('scopeNote est réinjectée à chaque tour utilisateur', async () => {
  // queryFn qui CONSOMME la queue de prompts pour observer ce qui part au modèle.
  const pushed: string[] = [];
  const queryFn = ((params: { prompt: AsyncIterable<{ message: { content: unknown } }> }) => {
    void (async () => {
      for await (const m of params.prompt) {
        pushed.push(typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message.content));
      }
    })();
    async function* gen() {
      yield { type: 'system', subtype: 'init', session_id: 'c1', model: 'm', permissionMode: 'bypassPermissions', cwd: '/tmp', tools: [] };
    }
    return gen() as AsyncGenerator<unknown> & Record<string, unknown>;
  }) as unknown as QueryFn;

  const mgr = createSdkAgentManager({ queryFn });
  mgr.startOrAttach('doc-1', fakeSocket(), {
    cwd: '/tmp',
    isDocSession: true,
    scopeNote: '<system-reminder>PERIM</system-reminder>',
  });
  mgr.sendUserMessage('doc-1', 'premier');
  mgr.sendUserMessage('doc-1', 'second');
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(pushed.length, 2);
  assert.ok(pushed[0].includes('PERIM'), 'tour 1');
  // Le point du test : contrairement aux notes persona (one-shot), scopeNote
  // n'est jamais consommée — sinon l'ancrage se perd après le premier tour.
  assert.ok(pushed[1].includes('PERIM'), 'tour 2 — la note ne doit PAS être consommée');
  assert.ok(pushed[1].includes('second'));
});
