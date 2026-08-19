import { describe, it, expect } from 'vitest';
import {
	DEFAULT_THEME_PREFS,
	normalizeThemePrefs,
	normalizeHexInput,
	appFontStack,
	terminalFontStack,
	googleFontsHref,
	APP_FONTS,
	TERMINAL_FONTS,
} from './themePrefs';

describe('normalizeThemePrefs', () => {
	it('returns defaults for null / garbage', () => {
		expect(normalizeThemePrefs(null)).toEqual(DEFAULT_THEME_PREFS);
		expect(normalizeThemePrefs('nope')).toEqual(DEFAULT_THEME_PREFS);
		expect(normalizeThemePrefs(42)).toEqual(DEFAULT_THEME_PREFS);
	});

	it('merges a partial object over the defaults', () => {
		const out = normalizeThemePrefs({ appFont: 'Inter' });
		expect(out.appFont).toBe('Inter');
		expect(out.appFontSize).toBe(DEFAULT_THEME_PREFS.appFontSize);
		expect(out.customTokens).toEqual(DEFAULT_THEME_PREFS.customTokens);
	});

	it('rejects an invalid hex color and keeps the default', () => {
		const out = normalizeThemePrefs({ customTokens: { primary: 'red' } });
		expect(out.customTokens.primary).toBe(DEFAULT_THEME_PREFS.customTokens.primary);
	});

	it('accepts a valid hex color', () => {
		const out = normalizeThemePrefs({ customTokens: { primary: '#123ABC' } });
		expect(out.customTokens.primary).toBe('#123ABC');
	});

	it('rejects an unknown font and clamps out-of-range sizes', () => {
		const out = normalizeThemePrefs({
			appFont: 'ComicSans',
			appFontSize: 999,
			terminalFontSize: 2,
		});
		expect(out.appFont).toBe(DEFAULT_THEME_PREFS.appFont);
		expect(out.appFontSize).toBe(20);
		expect(out.terminalFontSize).toBe(8);
	});

	it('rejects an invalid mode', () => {
		const out = normalizeThemePrefs({ customTokens: { mode: 'blue' } });
		expect(out.customTokens.mode).toBe(DEFAULT_THEME_PREFS.customTokens.mode);
	});
});

describe('normalizeHexInput', () => {
	it('accepts a full 6-digit hex with #', () => {
		expect(normalizeHexInput('#7C5CFF')).toBe('#7C5CFF');
	});

	it('accepts a 6-digit hex without # and normalizes the case', () => {
		expect(normalizeHexInput('7c5cff')).toBe('#7C5CFF');
	});

	it('expands the 3-digit shorthand', () => {
		expect(normalizeHexInput('#fff')).toBe('#FFFFFF');
		expect(normalizeHexInput('abc')).toBe('#AABBCC');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeHexInput('  #123abc  ')).toBe('#123ABC');
	});

	it('rejects invalid input', () => {
		expect(normalizeHexInput('')).toBeNull();
		expect(normalizeHexInput('#12')).toBeNull();
		expect(normalizeHexInput('#12345')).toBeNull();
		expect(normalizeHexInput('#gggggg')).toBeNull();
		expect(normalizeHexInput('rgb(0,0,0)')).toBeNull();
		expect(normalizeHexInput('red')).toBeNull();
	});
});

describe('font stacks', () => {
	it('quotes normal families with a sans-serif / monospace fallback', () => {
		expect(appFontStack('Inter')).toContain('"Inter"');
		expect(appFontStack('Inter')).toContain('sans-serif');
		expect(terminalFontStack('Fira Code')).toContain('"Fira Code"');
		expect(terminalFontStack('Fira Code')).toContain('monospace');
	});

	it('special-cases System UI and Menlo', () => {
		expect(appFontStack('System UI')).toContain('system-ui');
		expect(terminalFontStack('Menlo')).toContain('Menlo');
	});
});

describe('googleFontsHref', () => {
	it('includes the Google-hosted curated families', () => {
		const href = googleFontsHref();
		expect(href).toContain('family=Poppins');
		expect(href).toContain('family=Inter');
		expect(href).toContain('family=JetBrains+Mono');
		expect(href).toContain('display=swap');
	});
});

describe('curated lists', () => {
	it('expose the agreed families', () => {
		expect(APP_FONTS).toEqual(['Poppins', 'Inter', 'Roboto', 'System UI', 'Nunito']);
		expect(TERMINAL_FONTS).toEqual([
			'JetBrains Mono',
			'Fira Code',
			'Cascadia Code',
			'Source Code Pro',
			'Menlo',
		]);
	});
});

describe('normalizeThemePrefs — appFontSize', () => {
	it('clampe une valeur trop grande (ancien range) à 20', () => {
		const out = normalizeThemePrefs({ ...DEFAULT_THEME_PREFS, appFontSize: 32 });
		expect(out.appFontSize).toBe(20);
	});
	it('clampe une valeur trop petite à 10', () => {
		const out = normalizeThemePrefs({ ...DEFAULT_THEME_PREFS, appFontSize: 8 });
		expect(out.appFontSize).toBe(10);
	});
	it('laisse le terminal dans son range large', () => {
		const out = normalizeThemePrefs({ ...DEFAULT_THEME_PREFS, terminalFontSize: 28 });
		expect(out.terminalFontSize).toBe(28);
	});
});
