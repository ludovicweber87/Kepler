import { describe, it, expect } from 'vitest';
import {
	DEFAULT_THEME_PREFS,
	normalizeThemePrefs,
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
		const out = normalizeThemePrefs({ appFont: 'ComicSans', appFontSize: 999, terminalFontSize: 2 });
		expect(out.appFont).toBe(DEFAULT_THEME_PREFS.appFont);
		expect(out.appFontSize).toBe(32);
		expect(out.terminalFontSize).toBe(8);
	});

	it('rejects an invalid mode', () => {
		const out = normalizeThemePrefs({ customTokens: { mode: 'blue' } });
		expect(out.customTokens.mode).toBe(DEFAULT_THEME_PREFS.customTokens.mode);
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
		expect(TERMINAL_FONTS).toEqual(['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Source Code Pro', 'Menlo']);
	});
});
