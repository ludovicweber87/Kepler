import { describe, it, expect } from 'vitest';
import {
	ALL_REPOS,
	resolveActiveRepo,
	filterPersonasByRepo,
	reposOfPersona,
	shortRepoName,
	repoColor,
} from './personaRepos';
import type { Persona } from '@/types';

const persona = (id: string, repos: string[]) =>
	({
		id,
		name: id,
		role: null,
		system_prompt: null,
		model: null,
		effort: null,
		permission_mode: null,
		color: null,
		created_at: '',
		updated_at: '',
		repos,
	}) satisfies Persona;

const FRONT = 'acme/kepler';
const INFRA = 'acme/infra';
const REPOS = [INFRA, FRONT];

const REVIEWER = persona('p-reviewer', [FRONT, INFRA]);
const DESIGNER = persona('p-designer', [FRONT]);
const GLOBAL = persona('p-global', []);
const PERSONAS = [REVIEWER, DESIGNER, GLOBAL];

describe('resolveActiveRepo', () => {
	it('keeps a repo that is still configured', () => {
		expect(resolveActiveRepo(INFRA, REPOS)).toBe(INFRA);
	});

	it('falls back to ALL_REPOS when the repo path is gone', () => {
		expect(resolveActiveRepo('acme/deleted', REPOS)).toBe(ALL_REPOS);
		expect(resolveActiveRepo(FRONT, [])).toBe(ALL_REPOS);
	});

	it('leaves ALL_REPOS untouched', () => {
		expect(resolveActiveRepo(ALL_REPOS, REPOS)).toBe(ALL_REPOS);
	});
});

describe('filterPersonasByRepo', () => {
	it('returns every persona for ALL_REPOS', () => {
		expect(filterPersonasByRepo(PERSONAS, ALL_REPOS)).toEqual(PERSONAS);
	});

	it('keeps the personas linked to the repo', () => {
		expect(filterPersonasByRepo(PERSONAS, INFRA)).toEqual([REVIEWER, GLOBAL]);
	});

	it('keeps personas without any repo — elles sont globales', () => {
		expect(filterPersonasByRepo(PERSONAS, FRONT)).toContain(GLOBAL);
	});

	it('tolerates a missing repos (persona from a stale cache)', () => {
		const stale = { ...REVIEWER, repos: undefined } as unknown as Persona;
		expect(filterPersonasByRepo([stale], FRONT)).toEqual([stale]);
	});
});

describe('reposOfPersona', () => {
	it('returns the repos in tab order, not in link order', () => {
		expect(reposOfPersona(REVIEWER, REPOS)).toEqual([INFRA, FRONT]);
	});

	it('ignores repos that are no longer configured', () => {
		expect(reposOfPersona(persona('p-ghost', ['acme/gone']), REPOS)).toEqual([]);
	});
});

describe('shortRepoName', () => {
	it('drops the owner', () => {
		expect(shortRepoName('acme/kepler')).toBe('kepler');
		expect(shortRepoName('kepler')).toBe('kepler');
	});
});

describe('repoColor', () => {
	const palette = ['#a', '#b', '#c'];

	it('is stable for a given repo', () => {
		expect(repoColor(FRONT, palette)).toBe(repoColor(FRONT, palette));
	});

	it('stays inside the palette', () => {
		expect(palette).toContain(repoColor(INFRA, palette));
	});
});
