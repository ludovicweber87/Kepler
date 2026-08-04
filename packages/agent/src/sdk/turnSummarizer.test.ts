import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildTurnSummaryPrompt,
	fallbackSummary,
	immediateSummary,
	summarizeTurn,
} from './turnSummarizer.js';

test('buildTurnSummaryPrompt includes final text and actions', () => {
	const p = buildTurnSummaryPrompt('did stuff', ['file_change: a.ts', 'commit: fix']);
	assert.match(p, /did stuff/);
	assert.match(p, /a\.ts/);
	assert.match(p, /fix/);
});

test('fallbackSummary keeps medium text untouched', () => {
	const medium = 'x'.repeat(500);
	assert.equal(fallbackSummary(medium), medium);
});

test('fallbackSummary truncates very long text on a boundary', () => {
	const long = `${'mot '.repeat(400)}fin`;
	const out = fallbackSummary(long);
	assert.ok(out.length <= 1201);
	assert.match(out, /…$/);
	// Coupe sur une frontière → ne finit pas par un mot tronqué en plein milieu.
	assert.doesNotMatch(out, /mo…$/);
});

test('immediateSummary uses the final text when there is one', () => {
	assert.equal(immediateSummary('a fait le job', ['info: ls']), fallbackSummary('a fait le job'));
});

test('immediateSummary falls back to the actions when the turn has no final text', () => {
	// Tour interrompu / en erreur : le travail réalisé doit rester tracé.
	assert.equal(
		immediateSummary('', ['file_change: a.ts', 'commit: fix']),
		'- file_change: a.ts\n- commit: fix',
	);
});

test('immediateSummary returns empty when there is nothing to report', () => {
	// Garde anti-ligne-blanche dans l'onglet Activity.
	assert.equal(immediateSummary('   ', []), '');
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
