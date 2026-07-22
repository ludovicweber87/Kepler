import { describe, it, expect } from 'vitest';
import { buildPersonaSwitchMessage } from './personaSwitch';

describe('buildPersonaSwitchMessage', () => {
	it('inclut le nom de la persona et ses instructions', () => {
		const msg = buildPersonaSwitchMessage({
			name: 'Data Analyst',
			system_prompt: 'Tu analyses la donnée.',
		});
		expect(msg).toContain('Data Analyst');
		expect(msg).toContain('Tu analyses la donnée.');
		expect(msg).toContain('Nouvelles instructions');
	});

	it('gère un system_prompt vide ou null sans section instructions', () => {
		const empty = buildPersonaSwitchMessage({ name: 'PO', system_prompt: '' });
		expect(empty).toContain('PO');
		expect(empty).not.toContain('Nouvelles instructions');

		const nullish = buildPersonaSwitchMessage({ name: 'PO', system_prompt: null });
		expect(nullish).not.toContain('Nouvelles instructions');
	});

	it('demande toujours à l’agent de s’adapter', () => {
		const msg = buildPersonaSwitchMessage({ name: 'X', system_prompt: 'y' });
		expect(msg).toContain('Adapte ton comportement');
	});
});
