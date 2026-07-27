import { describe, expect, it } from 'vitest';
import { clamp01, hexToHsv, hsvToHex } from './color';

describe('clamp01', () => {
	it('bornes 0..1 et NaN → 0', () => {
		expect(clamp01(-0.5)).toBe(0);
		expect(clamp01(0.42)).toBe(0.42);
		expect(clamp01(3)).toBe(1);
		expect(clamp01(Number.NaN)).toBe(0);
	});
});

describe('hexToHsv', () => {
	it('convertit les couleurs de référence', () => {
		expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
		expect(hexToHsv('#FFFFFF')).toEqual({ h: 0, s: 0, v: 1 });
		expect(hexToHsv('#FF0000')).toEqual({ h: 0, s: 1, v: 1 });
		expect(hexToHsv('#00FF00')).toEqual({ h: 120, s: 1, v: 1 });
		expect(hexToHsv('#0000FF')).toEqual({ h: 240, s: 1, v: 1 });
	});

	it('tolère la casse et le # absent', () => {
		expect(hexToHsv('7c5cff')).toEqual(hexToHsv('#7C5CFF'));
	});

	it('retombe sur noir si invalide', () => {
		expect(hexToHsv('nope')).toEqual({ h: 0, s: 0, v: 0 });
		expect(hexToHsv('#FFF')).toEqual({ h: 0, s: 0, v: 0 });
	});
});

describe('hsvToHex', () => {
	it('convertit les couleurs de référence', () => {
		expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe('#000000');
		expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe('#FFFFFF');
		expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#FF0000');
		expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000FF');
	});

	it('normalise la teinte hors bornes et clampe s/v', () => {
		expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#FF0000');
		expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe('#0000FF');
		expect(hsvToHex({ h: 0, s: 5, v: 5 })).toBe('#FF0000');
	});

	it('fait un aller-retour stable', () => {
		for (const hex of ['#7C5CFF', '#00D4FF', '#EF4444', '#1A1A1A', '#B3B3B3']) {
			expect(hsvToHex(hexToHsv(hex))).toBe(hex);
		}
	});
});
