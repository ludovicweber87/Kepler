import { describe, it, expect } from 'vitest';
import { sortScripts, visibleScripts, nextSortOrder } from './repoScripts';

const s = (name: string, sort_order: number, created_at: string) => ({
	name,
	sort_order,
	created_at,
});

describe('sortScripts', () => {
	it('trie par sort_order croissant', () => {
		const out = sortScripts([s('c', 2, 'x'), s('a', 0, 'x'), s('b', 1, 'x')]);
		expect(out.map((x) => x.name)).toEqual(['a', 'b', 'c']);
	});

	it('départage un sort_order identique par created_at', () => {
		const out = sortScripts([
			s('late', 0, '2026-07-27T10:00:00.000Z'),
			s('early', 0, '2026-07-27T09:00:00.000Z'),
		]);
		expect(out.map((x) => x.name)).toEqual(['early', 'late']);
	});

	it('ne mute pas le tableau reçu', () => {
		const input = [s('b', 1, 'x'), s('a', 0, 'x')];
		sortScripts(input);
		expect(input.map((x) => x.name)).toEqual(['b', 'a']);
	});
});

describe('visibleScripts', () => {
	it('écarte les scripts sans nom', () => {
		const out = visibleScripts([s('ok', 0, 'x'), s('', 1, 'x'), s('   ', 2, 'x')]);
		expect(out.map((x) => x.name)).toEqual(['ok']);
	});

	it('trie ce qui reste', () => {
		const out = visibleScripts([s('b', 1, 'x'), s('', 0, 'x'), s('a', 0, 'x')]);
		expect(out.map((x) => x.name)).toEqual(['a', 'b']);
	});

	it('renvoie un tableau vide sur une liste vide', () => {
		expect(visibleScripts([])).toEqual([]);
	});
});

describe('nextSortOrder', () => {
	it('vaut 0 sur une liste vide', () => {
		expect(nextSortOrder([])).toBe(0);
	});

	it('prend le max + 1', () => {
		expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 4 }, { sort_order: 2 }])).toBe(5);
	});

	it('ignore les trous dans la numérotation', () => {
		expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 9 }])).toBe(10);
	});
});
