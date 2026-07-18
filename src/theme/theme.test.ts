import { describe, it, expect } from 'vitest';
import {
	getTheme,
	THEME_VARIANTS,
	PRESET_VARIANTS,
	DEFAULT_THEME_VARIANT,
	type ThemeVariant,
} from './theme';
import { resolveStoredVariant } from '@/hooks/useColorMode';
import { DEFAULT_THEME_PREFS } from '@/lib/themePrefs';

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
	const c = hex.replace('#', '');
	const channels = [0, 2, 4]
		.map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
		.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
	const [la, lb] = [luminance(a), luminance(b)];
	const [hi, lo] = [Math.max(la, lb), Math.min(la, lb)];
	return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;
const LIGHT_VARIANTS: ThemeVariant[] = PRESET_VARIANTS.filter(
	(v) => getTheme(v).palette.mode === 'light',
);

describe('getTheme', () => {
	it('maps each variant to the expected palette mode', () => {
		expect(getTheme('dark').palette.mode).toBe('dark');
		for (const v of LIGHT_VARIANTS) {
			expect(getTheme(v).palette.mode).toBe('light');
		}
	});

	it('falls back to the default variant for an unknown value', () => {
		const fallback = getTheme('nope' as ThemeVariant);
		expect(fallback.palette.mode).toBe(getTheme(DEFAULT_THEME_VARIANT).palette.mode);
	});

	it('keeps body text readable (AA) on both surfaces for every variant', () => {
		for (const v of PRESET_VARIANTS) {
			const { palette } = getTheme(v);
			for (const surface of [palette.background.paper, palette.background.default]) {
				expect(contrast(palette.text.primary, surface)).toBeGreaterThanOrEqual(AA);
				expect(contrast(palette.text.secondary, surface)).toBeGreaterThanOrEqual(AA);
			}
		}
	});

	it('keeps accent text readable (AA) on paper for light variants', () => {
		for (const v of LIGHT_VARIANTS) {
			const { palette } = getTheme(v);
			const accents = [
				palette.primary.main,
				palette.secondary.main,
				palette.error.main,
				palette.warning.main,
				palette.success.main,
				palette.info.main,
			];
			for (const accent of accents) {
				expect(contrast(accent, palette.background.paper)).toBeGreaterThanOrEqual(AA);
			}
		}
	});
});

describe('resolveStoredVariant', () => {
	it('defaults when nothing is stored', () => {
		expect(resolveStoredVariant(null)).toBe(DEFAULT_THEME_VARIANT);
	});

	it('migrates legacy values', () => {
		expect(resolveStoredVariant('light')).toBe('light-warm');
		expect(resolveStoredVariant('dark')).toBe('dark');
	});

	it('passes through known variants', () => {
		for (const v of THEME_VARIANTS) {
			expect(resolveStoredVariant(v)).toBe(v);
		}
	});

	it('falls back for unknown values', () => {
		expect(resolveStoredVariant('garbage')).toBe(DEFAULT_THEME_VARIANT);
	});
});

describe('getTheme custom variant', () => {
	it('defaults to the dark seed when no prefs are given', () => {
		const theme = getTheme('custom');
		expect(theme.palette.mode).toBe('dark');
		expect(theme.palette.primary.main).toBe(DEFAULT_THEME_PREFS.customTokens.primary);
	});

	it('applies the provided custom tokens and mode', () => {
		const prefs = {
			...DEFAULT_THEME_PREFS,
			customTokens: {
				...DEFAULT_THEME_PREFS.customTokens,
				mode: 'light' as const,
				primary: '#112233',
				backgroundPaper: '#FFFFFF',
			},
		};
		const theme = getTheme('custom', prefs);
		expect(theme.palette.mode).toBe('light');
		expect(theme.palette.primary.main).toBe('#112233');
		expect(theme.palette.background.paper).toBe('#FFFFFF');
	});

	it('derives distinct light/dark shades for primary', () => {
		const theme = getTheme('custom');
		expect(theme.palette.primary.light).not.toBe(theme.palette.primary.main);
		expect(theme.palette.primary.dark).not.toBe(theme.palette.primary.main);
	});

	it('applies app typography prefs to any variant', () => {
		const prefs = { ...DEFAULT_THEME_PREFS, appFont: 'Inter', appFontSize: 15 };
		const theme = getTheme('dark', prefs);
		expect(theme.typography.fontFamily).toContain('Inter');
		expect(theme.typography.fontSize).toBe(15);
	});
});
