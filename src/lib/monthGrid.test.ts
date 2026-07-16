import { describe, it, expect } from 'vitest';
import { buildMonthGrid, parseMonth, toKey, shiftMonth } from './monthGrid';

describe('monthGrid', () => {
	it('découpe en semaines de 7 jours', () => {
		const weeks = buildMonthGrid('2026-07');
		expect(weeks.length).toBeGreaterThanOrEqual(5);
		for (const w of weeks) expect(w).toHaveLength(7);
	});

	it('commence le lundi par défaut', () => {
		// 1er juillet 2026 = mercredi → la grille commence lundi 29 juin.
		const weeks = buildMonthGrid('2026-07');
		expect(weeks[0][0].key).toBe('2026-06-29');
		expect(weeks[0][0].inMonth).toBe(false);
	});

	it('marque inMonth correctement', () => {
		const weeks = buildMonthGrid('2026-07');
		const flat = weeks.flat();
		expect(flat.find((d) => d.key === '2026-07-01')?.inMonth).toBe(true);
		expect(flat.find((d) => d.key === '2026-07-31')?.inMonth).toBe(true);
		expect(flat.find((d) => d.key === '2026-06-29')?.inMonth).toBe(false);
	});

	it('contient tous les jours du mois', () => {
		const inMonth = buildMonthGrid('2026-02')
			.flat()
			.filter((d) => d.inMonth);
		expect(inMonth).toHaveLength(28); // février 2026
	});

	it('parseMonth + toKey sont cohérents', () => {
		expect(toKey(parseMonth('2026-07'))).toBe('2026-07-01');
	});

	it('shiftMonth navigue et gère le passage d\'année', () => {
		expect(shiftMonth('2026-07', 1)).toBe('2026-08');
		expect(shiftMonth('2026-07', -1)).toBe('2026-06');
		expect(shiftMonth('2026-12', 1)).toBe('2027-01');
		expect(shiftMonth('2026-01', -1)).toBe('2025-12');
	});
});
