import { describe, expect, it } from 'vitest';
import type { DailyRecap } from '@/types';
import { aggregatePointsByDay, parseRecapPoints, truncateTitle } from './recap';

function makeRecap(partial: Partial<DailyRecap> & { recap_date: string }): DailyRecap {
	return {
		id: partial.id ?? partial.recap_date,
		repo_full_name: 'o/r',
		content: '',
		items: null,
		trigger_type: 'manual',
		created_at: '2026-07-22T10:00:00Z',
		...partial,
	};
}

describe('parseRecapPoints', () => {
	it('extrait les puces markdown en retirant le marqueur', () => {
		const content = "- J'ai fait A\n- J'ai fait B";
		expect(parseRecapPoints(content)).toEqual(["J'ai fait A", "J'ai fait B"]);
	});

	it('gère les marqueurs *, + et les listes numérotées', () => {
		const content = '* un\n+ deux\n1. trois';
		expect(parseRecapPoints(content)).toEqual(['un', 'deux', 'trois']);
	});

	it('retire les marqueurs de titre et ignore les lignes vides', () => {
		const content = '## Section\n\n- point';
		expect(parseRecapPoints(content)).toEqual(['Section', 'point']);
	});

	it('renvoie le contenu en un point unique si aucune puce', () => {
		const content = '_Aucune activité enregistrée pour ce jour._';
		expect(parseRecapPoints(content)).toEqual(['_Aucune activité enregistrée pour ce jour._']);
	});

	it('renvoie un tableau vide pour un contenu vide ou blanc', () => {
		expect(parseRecapPoints('')).toEqual([]);
		expect(parseRecapPoints('   \n  ')).toEqual([]);
	});
});

describe('truncateTitle', () => {
	it('laisse le texte intact sous la limite', () => {
		expect(truncateTitle('court', 100)).toBe('court');
	});

	it('tronque et ajoute une ellipsis au-delà de la limite', () => {
		const text = 'a'.repeat(120);
		const result = truncateTitle(text, 100);
		expect(result).toBe('a'.repeat(100) + '…');
		expect(result.length).toBe(101);
	});

	it('retire les espaces de fin avant l’ellipsis', () => {
		const text = 'a'.repeat(98) + '   bbb';
		expect(truncateTitle(text, 100)).toBe('a'.repeat(98) + '…');
	});
});

describe('aggregatePointsByDay', () => {
	it('regroupe les points par jour', () => {
		const map = aggregatePointsByDay([
			makeRecap({ recap_date: '2026-07-20', content: '- a\n- b' }),
			makeRecap({ recap_date: '2026-07-21', content: '- c' }),
		]);
		expect(map.get('2026-07-20')).toEqual(['a', 'b']);
		expect(map.get('2026-07-21')).toEqual(['c']);
	});

	it('concatène les points de plusieurs recaps le même jour', () => {
		const map = aggregatePointsByDay([
			makeRecap({ id: '1', recap_date: '2026-07-20', content: '- a\n- b' }),
			makeRecap({ id: '2', recap_date: '2026-07-20', content: '- c' }),
		]);
		expect(map.get('2026-07-20')).toEqual(['a', 'b', 'c']);
	});

	it('garde un jour avec un tableau vide si le contenu ne produit aucun point', () => {
		const map = aggregatePointsByDay([makeRecap({ recap_date: '2026-07-20', content: '   ' })]);
		expect(map.has('2026-07-20')).toBe(true);
		expect(map.get('2026-07-20')).toEqual([]);
	});

	it('renvoie une map vide sans recap', () => {
		expect(aggregatePointsByDay([]).size).toBe(0);
	});
});
