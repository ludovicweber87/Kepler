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
