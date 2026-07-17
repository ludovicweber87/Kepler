import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnSummaryPrompt, fallbackSummary, summarizeTurn } from './turnSummarizer.js';

test('buildTurnSummaryPrompt includes final text and actions', () => {
	const p = buildTurnSummaryPrompt('did stuff', ['file_change: a.ts', 'commit: fix']);
	assert.match(p, /did stuff/);
	assert.match(p, /a\.ts/);
	assert.match(p, /fix/);
});

test('fallbackSummary truncates long text', () => {
	const long = 'x'.repeat(500);
	const out = fallbackSummary(long);
	assert.ok(out.length <= 281);
	assert.match(out, /…$/);
});

test('summarizeTurn returns runner output when non-empty', async () => {
	const out = await summarizeTurn('final', ['info: ls'], async () => '- discovered X');
	assert.equal(out, '- discovered X');
});

test('summarizeTurn falls back on empty runner output', async () => {
	const out = await summarizeTurn('final text', [], async () => '   ');
	assert.equal(out, fallbackSummary('final text'));
});

test('summarizeTurn falls back when runner throws', async () => {
	const out = await summarizeTurn('boom text', [], async () => {
		throw new Error('nope');
	});
	assert.equal(out, fallbackSummary('boom text'));
});
