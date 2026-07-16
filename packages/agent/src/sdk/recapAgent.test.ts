import { test } from 'node:test';
import assert from 'node:assert';
import { buildRecapPrompt, runRecapAgent, type QueryFn } from './recapAgent.js';

test('buildRecapPrompt inclut le repo, la date et les items', () => {
	const prompt = buildRecapPrompt('org/repo', '2026-07-16', [
		{ time: '09:00', type: 'commit', text: 'feat: X' },
	]);
	assert.match(prompt, /org\/repo/);
	assert.match(prompt, /2026-07-16/);
	assert.match(prompt, /\[commit\] feat: X/);
});

test('buildRecapPrompt gère le cas sans activité pré-collectée', () => {
	const prompt = buildRecapPrompt('org/repo', '2026-07-16', []);
	assert.match(prompt, /inspecte toi-même le dépôt/);
});

// query() factice : émet un bloc assistant puis un result.
function fakeQuery(resultText: string, assistant?: string): QueryFn {
	return ((_params: unknown) => {
		async function* gen() {
			if (assistant) {
				yield {
					type: 'assistant',
					message: { role: 'assistant', content: [{ type: 'text', text: assistant }] },
				};
			}
			yield { type: 'result', subtype: 'success', result: resultText };
		}
		return gen();
	}) as unknown as QueryFn;
}

test('runRecapAgent retourne le texte du message result', async () => {
	const out = await runRecapAgent({
		cwd: '/tmp',
		prompt: 'p',
		queryFn: fakeQuery('# Rapport\n- fait X'),
	});
	assert.equal(out, '# Rapport\n- fait X');
});

test('runRecapAgent retombe sur le texte assistant si result vide', async () => {
	const out = await runRecapAgent({
		cwd: '/tmp',
		prompt: 'p',
		queryFn: fakeQuery('', 'texte assistant'),
	});
	assert.equal(out, 'texte assistant');
});
