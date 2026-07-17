import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportPrompt, synthesizeReport } from './reportSynth.js';

test('buildReportPrompt includes the log contents and the section headers', () => {
	const p = buildReportPrompt([
		{ log_type: 'summary', content: 'lu le fichier X' },
		{ log_type: 'error', content: 'échec test Y' },
	]);
	assert.match(p, /lu le fichier X/);
	assert.match(p, /échec test Y/);
	assert.match(p, /## Fait/);
	assert.match(p, /## Décisions/);
	assert.match(p, /## Reste à faire/);
});

test('synthesizeReport returns runner output', async () => {
	const out = await synthesizeReport([{ log_type: 'summary', content: 'x' }], async () => '## Fait\n- x');
	assert.match(out, /## Fait/);
});

test('synthesizeReport throws on empty logs is avoided — returns empty string', async () => {
	const out = await synthesizeReport([], async () => 'unused');
	assert.equal(out, '');
});
