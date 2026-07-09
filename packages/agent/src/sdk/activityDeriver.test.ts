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
