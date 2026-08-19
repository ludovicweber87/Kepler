import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePromptQueue, buildUserContent } from './promptQueue.js';

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

test('buildUserContent: no images → plain string', () => {
	assert.equal(buildUserContent('hello'), 'hello');
	assert.equal(buildUserContent('hi', []), 'hi');
});

test('buildUserContent: with images → content-block array', () => {
	const content = buildUserContent('look', [
		{ name: 'a.png', mediaType: 'image/png', data: 'BASE64DATA' },
	]) as Array<Record<string, unknown>>;
	assert.ok(Array.isArray(content));
	assert.deepEqual(content[0], { type: 'text', text: 'look' });
	assert.deepEqual(content[1], {
		type: 'image',
		source: { type: 'base64', media_type: 'image/png', data: 'BASE64DATA' },
	});
});

test('buildUserContent: empty text with image → only image block', () => {
	const content = buildUserContent('', [
		{ name: 'a.png', mediaType: 'image/png', data: 'X' },
	]) as Array<Record<string, unknown>>;
	assert.equal(content.length, 1);
	assert.equal((content[0] as Record<string, unknown>).type, 'image');
});
