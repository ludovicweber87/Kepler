import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLastUserText } from './retryLastUser.js';
import type { StreamEvent } from './types.js';

function row(seq: number, event: StreamEvent) {
	return { seq, event };
}

test('dernier event = user avec texte → renvoie le texte (trim)', () => {
	const transcript = [
		row(1, { event: 'user', data: { text: 'première demande' } }),
		row(2, { event: 'assistant', data: { text: 'ok' } }),
		row(3, {
			event: 'result',
			data: {
				is_error: false,
				text: 'ok',
				session_id: 'c',
				num_turns: 1,
				usage: {},
				total_cost_usd: 0,
			},
		}),
		row(4, { event: 'user', data: { text: '  relance stp  ' } }),
	];
	assert.equal(extractLastUserText(transcript), 'relance stp');
});

test('dernier event = assistant (run entamé) → null', () => {
	const transcript = [
		row(1, { event: 'user', data: { text: 'demande' } }),
		row(2, { event: 'assistant', data: { text: 'je réponds…' } }),
	];
	assert.equal(extractLastUserText(transcript), null);
});

test('dernier event = result (tour terminé) → null', () => {
	const transcript = [
		row(1, { event: 'user', data: { text: 'demande' } }),
		row(2, {
			event: 'result',
			data: {
				is_error: false,
				text: 'fini',
				session_id: 'c',
				num_turns: 1,
				usage: {},
				total_cost_usd: 0,
			},
		}),
	];
	assert.equal(extractLastUserText(transcript), null);
});

test('dernier event = user mais texte vide → null', () => {
	const transcript = [row(1, { event: 'user', data: { text: '   ' } })];
	assert.equal(extractLastUserText(transcript), null);
});

test('transcript vide → null', () => {
	assert.equal(extractLastUserText([]), null);
});
