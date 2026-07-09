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
