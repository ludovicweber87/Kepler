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
