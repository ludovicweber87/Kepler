import { describe, it, expect } from 'vitest';
import { clampAppFontSize, appFontScale, rootFontSizePx, APP_FONT_BASE } from './appFontScale';

describe('clampAppFontSize', () => {
	it('renvoie la baseline pour une entrée non numérique', () => {
		expect(clampAppFontSize('nope' as unknown)).toBe(12);
		expect(clampAppFontSize(Number.NaN)).toBe(12);
	});
	it('clamp sous le minimum à 10', () => {
		expect(clampAppFontSize(4)).toBe(10);
	});
	it('clamp au-dessus du maximum à 20', () => {
		expect(clampAppFontSize(40)).toBe(20);
	});
	it('arrondit et laisse passer les valeurs dans la plage', () => {
		expect(clampAppFontSize(14.4)).toBe(14);
	});
});

describe('appFontScale', () => {
	it('vaut 1 à la baseline', () => {
		expect(appFontScale(APP_FONT_BASE)).toBe(1);
	});
	it('scale proportionnellement dans la plage', () => {
		expect(appFontScale(18)).toBeCloseTo(1.5);
	});
	it('utilise la valeur clampée hors plage', () => {
		expect(appFontScale(100)).toBeCloseTo(20 / 12);
	});
});

describe('rootFontSizePx', () => {
	it('vaut 16 à la baseline', () => {
		expect(rootFontSizePx(12)).toBe(16);
	});
	it('scale le root avec la taille de police', () => {
		expect(rootFontSizePx(18)).toBe(24);
	});
});
