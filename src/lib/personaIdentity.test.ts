import { describe, it, expect } from 'vitest';
import { resolvePersonaIdentity } from './personaIdentity';
import type { Persona } from '@/types';

const persona = (id: string, name: string, color: string | null = '#7C5CFF') =>
	({
		id,
		name,
		role: null,
		system_prompt: null,
		model: null,
		effort: null,
		permission_mode: null,
		color,
		created_at: '',
		updated_at: '',
		folder_ids: [],
	}) satisfies Persona;

const PERSONAS = [
	persona('p-debug', 'The Debugger', '#EF4444'),
	persona('p-po', 'Product Owner', null),
];

describe('resolvePersonaIdentity', () => {
	it('resolves the persona referenced by persona_id', () => {
		expect(resolvePersonaIdentity({ persona_id: 'p-debug' }, PERSONAS)).toEqual({
			personaId: 'p-debug',
			name: 'The Debugger',
			color: '#EF4444',
		});
	});

	it('returns an empty identity when the session has no persona', () => {
		const empty = { personaId: null, name: null, color: null };
		expect(resolvePersonaIdentity({ persona_id: null }, PERSONAS)).toEqual(empty);
		expect(resolvePersonaIdentity({ persona_id: '  ' }, PERSONAS)).toEqual(empty);
		expect(resolvePersonaIdentity({}, PERSONAS)).toEqual(empty);
		expect(resolvePersonaIdentity(null, PERSONAS)).toEqual(empty);
		expect(resolvePersonaIdentity(undefined, PERSONAS)).toEqual(empty);
	});

	it('treats a persona_id pointing to a deleted persona as no persona', () => {
		expect(resolvePersonaIdentity({ persona_id: 'p-gone' }, PERSONAS)).toEqual({
			personaId: null,
			name: null,
			color: null,
		});
	});

	// Régression : le chip du composer affichait le label de session (agent_name),
	// réécrit par l'auto-rename → le nom de « persona » changeait tout seul.
	it('never derives the identity from the session label or color', () => {
		const session = {
			persona_id: null,
			agent_name: 'The Debugger',
			agent_color: '#00D4FF',
		};
		expect(resolvePersonaIdentity(session, PERSONAS)).toEqual({
			personaId: null,
			name: null,
			color: null,
		});
	});

	it('keeps a null persona color as null instead of inventing one', () => {
		expect(resolvePersonaIdentity({ persona_id: 'p-po' }, PERSONAS).color).toBeNull();
	});
});
