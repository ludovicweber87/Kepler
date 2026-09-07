import { describe, it, expect } from 'vitest';
import { pickDefaultPersona } from './personaDefault';
import type { Persona } from '@/types';

const persona = (id: string, is_default: boolean) =>
	({
		id,
		name: id,
		role: null,
		system_prompt: null,
		model: null,
		effort: null,
		permission_mode: null,
		color: null,
		is_default,
		created_at: '',
		updated_at: '',
		repos: [],
	}) satisfies Persona;

describe('pickDefaultPersona', () => {
	it('renvoie la persona marquée par défaut', () => {
		const personas = [persona('a', false), persona('b', true), persona('c', false)];
		expect(pickDefaultPersona(personas)?.id).toBe('b');
	});

	it('renvoie null quand aucune persona ne porte le drapeau', () => {
		expect(pickDefaultPersona([persona('a', false)])).toBeNull();
	});

	it('renvoie null sur une liste vide', () => {
		expect(pickDefaultPersona([])).toBeNull();
	});

	it('prend la première quand la base est incohérente (deux drapeaux)', () => {
		const personas = [persona('a', true), persona('b', true)];
		expect(pickDefaultPersona(personas)?.id).toBe('a');
	});
});
