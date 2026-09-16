import { describe, it, expect } from 'vitest';
import { filterMentions, scoreMention } from './mentionFilter';

const identity = (s: string) => [s];

describe('scoreMention', () => {
	it('classe préfixe complet < préfixe du nom de fichier < sous-chaîne < sous-séquence', () => {
		const path = 'src/lib/mentionFilter.ts';
		expect(scoreMention(path, 'src/li')).toBe(0);
		expect(scoreMention(path, 'mention')).toBe(1);
		expect(scoreMention('a/bcd.ts', 'cd')).toBeGreaterThan(1);
		expect(scoreMention('a/bcd.ts', 'cd')).toBeLessThan(100);
		expect(scoreMention(path, 'mft')).toBe(100);
	});

	it('renvoie null quand rien ne correspond, 0 sur une saisie vide', () => {
		expect(scoreMention('src/a.ts', 'zzz')).toBeNull();
		expect(scoreMention('src/a.ts', '')).toBe(0);
	});

	it('ignore la casse', () => {
		expect(scoreMention('src/ChatComposer.tsx', 'chatcomp')).toBe(1);
	});
});

describe('filterMentions', () => {
	it('trie par score puis préserve l ordre d entrée à égalité', () => {
		expect(filterMentions(['b/pr.ts', 'a/pr.ts', 'pr/z.ts'], 'pr', identity)).toEqual([
			'pr/z.ts',
			'b/pr.ts',
			'a/pr.ts',
		]);
	});

	it('retient le meilleur score parmi toutes les clés d une entrée', () => {
		const cmds = [
			{ name: 'usage', aliases: ['cost'] },
			{ name: 'costume', aliases: [] },
		];
		expect(
			filterMentions(cmds, 'cost', (c) => [c.name, ...c.aliases]).map((c) => c.name),
		).toEqual(['usage', 'costume']);
	});

	it('écarte les entrées sans match et respecte la limite', () => {
		expect(filterMentions(['a.ts', 'b.ts'], 'zzz', identity)).toEqual([]);
		expect(filterMentions(['a1', 'a2', 'a3'], 'a', identity, 2)).toEqual(['a1', 'a2']);
	});

	it('renvoie tout, dans l ordre, sur une saisie vide', () => {
		expect(filterMentions(['b', 'a'], '', identity)).toEqual(['b', 'a']);
	});
});
