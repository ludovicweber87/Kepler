import { describe, it, expect } from 'vitest';
import { clampSplitPct, parseSplitPct, SPLIT_DEFAULT } from './workbenchSplit';

describe('clampSplitPct', () => {
	it('clamp sous 40', () => {
		expect(clampSplitPct(10)).toBe(40);
	});
	it('clamp au-dessus de 80', () => {
		expect(clampSplitPct(95)).toBe(80);
	});
	it('laisse passer une valeur dans la plage', () => {
		expect(clampSplitPct(68)).toBe(68);
	});
	it('fallback sur NaN', () => {
		expect(clampSplitPct(Number.NaN)).toBe(SPLIT_DEFAULT);
	});
});

describe('parseSplitPct', () => {
	it('parse une string enregistrée', () => {
		expect(parseSplitPct('72')).toBe(72);
	});
	it('clamp une valeur DB hors plage', () => {
		expect(parseSplitPct('120')).toBe(80);
	});
	it('fallback sur null', () => {
		expect(parseSplitPct(null)).toBe(68);
	});
	it('fallback sur une valeur non numérique', () => {
		expect(parseSplitPct('abc')).toBe(68);
	});
});
