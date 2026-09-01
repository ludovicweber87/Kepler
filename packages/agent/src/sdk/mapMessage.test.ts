import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapDelta, mapMessage } from './mapMessage.js';
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

// ── mapDelta ──

const streamEvent = (delta: unknown, parent: string | null = null) => m({
  type: 'stream_event', session_id: 's1', parent_tool_use_id: parent,
  event: { type: 'content_block_delta', index: 0, delta },
});

test('text_delta → delta texte', () => {
  assert.deepEqual(mapDelta(streamEvent({ type: 'text_delta', text: 'Bon' })), { kind: 'text', text: 'Bon' });
});

test('thinking_delta → delta thinking', () => {
  assert.deepEqual(mapDelta(streamEvent({ type: 'thinking_delta', thinking: 'hmm' })), { kind: 'thinking', text: 'hmm' });
});

test('deltas sans rendu (json partiel, signature, texte vide) → null', () => {
  assert.equal(mapDelta(streamEvent({ type: 'input_json_delta', partial_json: '{"a"' })), null);
  assert.equal(mapDelta(streamEvent({ type: 'signature_delta', signature: 'x' })), null);
  assert.equal(mapDelta(streamEvent({ type: 'text_delta', text: '' })), null);
});

test('delta de sous-agent → null (n entrelace pas le brouillon principal)', () => {
  assert.equal(mapDelta(streamEvent({ type: 'text_delta', text: 'sub' }, 'tu-parent')), null);
});

test('autres stream_event (content_block_start/stop) → null', () => {
  assert.equal(mapDelta(m({ type: 'stream_event', session_id: 's1', parent_tool_use_id: null, event: { type: 'content_block_stop', index: 0 } })), null);
});

test('tool_progress → delta de progression, secondes arrondies', () => {
  assert.deepEqual(
    mapDelta(m({ type: 'tool_progress', tool_use_id: 'tu1', tool_name: 'Bash', elapsed_time_seconds: 12.7, session_id: 's1', parent_tool_use_id: null })),
    { kind: 'tool_progress', toolUseId: 'tu1', toolName: 'Bash', elapsedSeconds: 13 },
  );
});

test('api_retry → delta de retry', () => {
  assert.deepEqual(
    mapDelta(m({ type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 5, retry_delay_ms: 1500, session_id: 's1' })),
    { kind: 'api_retry', attempt: 2, maxRetries: 5, delayMs: 1500 },
  );
});

test('messages persistés (assistant, result) → null côté mapDelta', () => {
  assert.equal(mapDelta(m({ type: 'assistant', session_id: 's1', message: { role: 'assistant', content: [] } })), null);
  assert.equal(mapDelta(m({ type: 'result', subtype: 'success', session_id: 's1' })), null);
});
