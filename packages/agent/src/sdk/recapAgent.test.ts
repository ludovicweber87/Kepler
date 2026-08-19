import { test } from 'node:test';
import assert from 'node:assert';
import { buildRecapPrompt, runRecapAgent } from './recapAgent.js';

test('buildRecapPrompt inclut le repo, la date et les items', () => {
	const prompt = buildRecapPrompt('org/repo', '2026-07-16', [
		{ time: '09:00', type: 'commit', text: 'feat: X' },
	]);
	assert.match(prompt, /org\/repo/);
	assert.match(prompt, /2026-07-16/);
	assert.match(prompt, /\[commit\] feat: X/);
});

test('buildRecapPrompt reste compact : items plafonnés et texte tronqué', () => {
	const items = Array.from({ length: 200 }, (_, i) => ({
		time: '09:00',
		type: 'file_change',
		text: `${i} `.padEnd(500, 'x'),
	}));
	const prompt = buildRecapPrompt('org/repo', '2026-07-16', items);
	assert.ok(prompt.length < 5000, `prompt trop long: ${prompt.length}`);
	assert.ok(!/xxxx{200}/.test(prompt));
});

test("buildRecapPrompt interdit l'exploration du dépôt", () => {
	const prompt = buildRecapPrompt('org/repo', '2026-07-16', [
		{ time: '09:00', type: 'commit', text: 'feat: X' },
	]);
	assert.match(prompt, /n'explore pas le dépôt/);
	assert.ok(!prompt.includes('git log'));
});

test('runRecapAgent retourne la sortie du CLI, trimée', async () => {
	const out = await runRecapAgent({
		cwd: '/tmp',
		prompt: 'p',
		run: async () => '  - fait X\n',
	});
	assert.equal(out, '- fait X');
});

test('runRecapAgent utilise haiku par défaut', async () => {
	let usedModel = '';
	await runRecapAgent({
		cwd: '/tmp',
		prompt: 'p',
		run: async (_prompt, _cwd, model) => {
			usedModel = model;
			return 'ok';
		},
	});
	assert.equal(usedModel, 'haiku');
});
