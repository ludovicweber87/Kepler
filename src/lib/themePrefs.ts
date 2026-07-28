import { clampAppFontSize } from './appFontScale';

export type CustomThemeTokens = {
	mode: 'light' | 'dark';
	primary: string;
	secondary: string;
	error: string;
	warning: string;
	success: string;
	info: string;
	backgroundDefault: string;
	backgroundPaper: string;
	textPrimary: string;
	textSecondary: string;
	divider: string;
	cardHover: string;
	cardBorderHover: string;
	drawer: string;
	drawerBorder: string;
};

export type ThemePrefs = {
	customTokens: CustomThemeTokens;
	appFont: string;
	appFontSize: number;
	terminalFont: string;
	terminalFontSize: number;
};

// Seed = the `dark` preset from theme/theme.ts.
export const DEFAULT_CUSTOM_TOKENS: CustomThemeTokens = {
	mode: 'dark',
	primary: '#7C5CFF',
	secondary: '#00D4FF',
	error: '#EF4444',
	warning: '#F59E0B',
	success: '#22C55E',
	info: '#00D4FF',
	backgroundDefault: '#1A1A1A',
	backgroundPaper: '#222222',
	textPrimary: '#FFFFFF',
	textSecondary: '#B3B3B3',
	divider: '#3A3A3A',
	cardHover: '#2A2A2A',
	cardBorderHover: '#444444',
	drawer: '#1A1A1A',
	drawerBorder: '#3A3A3A',
};

export const DEFAULT_THEME_PREFS: ThemePrefs = {
	customTokens: DEFAULT_CUSTOM_TOKENS,
	appFont: 'Poppins',
	appFontSize: 12,
	terminalFont: 'JetBrains Mono',
	terminalFontSize: 14,
};

/** Police du wordmark « Kepler ». Fixe : c'est un élément d'identité, pas un réglage. */
export const BRAND_FONT_STACK = '"Alfa Slab One", "Roboto Slab", Georgia, serif';

export const APP_FONTS = ['Poppins', 'Inter', 'Roboto', 'System UI', 'Nunito'];
export const TERMINAL_FONTS = ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Source Code Pro', 'Menlo'];

export const COLOR_TOKEN_KEYS: (keyof Omit<CustomThemeTokens, 'mode'>)[] = [
	'primary',
	'secondary',
	'error',
	'warning',
	'success',
	'info',
	'backgroundDefault',
	'backgroundPaper',
	'textPrimary',
	'textSecondary',
	'divider',
	'cardHover',
	'cardBorderHover',
	'drawer',
	'drawerBorder',
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const MIN_SIZE = 8;
const MAX_SIZE = 32;

function hex(value: unknown, fallback: string): string {
	return typeof value === 'string' && HEX.test(value) ? value : fallback;
}

// Lenient HEX parser for manual text input: tolerates an optional leading '#',
// surrounding whitespace, any case, and the 3-digit shorthand (#fff → #ffffff).
// Returns the canonical `#RRGGBB` (uppercase) form, or null when invalid.
export function normalizeHexInput(input: string): string | null {
	if (typeof input !== 'string') return null;
	const raw = input.trim().replace(/^#/, '');
	if (!/^[0-9a-fA-F]+$/.test(raw)) return null;
	let digits: string;
	if (raw.length === 3) {
		digits = raw
			.split('')
			.map((c) => c + c)
			.join('');
	} else if (raw.length === 6) {
		digits = raw;
	} else {
		return null;
	}
	return `#${digits.toUpperCase()}`;
}

function clampSize(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
	return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value)));
}

function pick(value: unknown, allowed: string[], fallback: string): string {
	return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function normalizeTokens(raw: unknown): CustomThemeTokens {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const d = DEFAULT_CUSTOM_TOKENS;
	const out = { ...d } as CustomThemeTokens;
	out.mode = r.mode === 'light' || r.mode === 'dark' ? r.mode : d.mode;
	for (const key of COLOR_TOKEN_KEYS) {
		out[key] = hex(r[key], d[key]);
	}
	return out;
}

export function normalizeThemePrefs(raw: unknown): ThemePrefs {
	if (!raw || typeof raw !== 'object') return DEFAULT_THEME_PREFS;
	const r = raw as Record<string, unknown>;
	return {
		customTokens: normalizeTokens(r.customTokens),
		appFont: pick(r.appFont, APP_FONTS, DEFAULT_THEME_PREFS.appFont),
		appFontSize: clampAppFontSize(r.appFontSize),
		terminalFont: pick(r.terminalFont, TERMINAL_FONTS, DEFAULT_THEME_PREFS.terminalFont),
		terminalFontSize: clampSize(r.terminalFontSize, DEFAULT_THEME_PREFS.terminalFontSize),
	};
}

export function appFontStack(name: string): string {
	if (name === 'System UI') {
		return 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
	}
	return `"${name}", "Roboto", "Helvetica", "Arial", sans-serif`;
}

export function terminalFontStack(name: string): string {
	if (name === 'Menlo') {
		return 'Menlo, Monaco, "Courier New", monospace';
	}
	return `"${name}", "JetBrains Mono", "Fira Code", monospace`;
}

// Only Google-hosted families (System UI, Cascadia Code, Menlo are local/system).
export function googleFontsHref(): string {
	const families = [
		// Le wordmark du logo, et lui seul : volontairement hors de `APP_FONTS`, la police
		// de marque ne doit pas suivre le choix de police de l'utilisateur.
		'Alfa+Slab+One',
		'Poppins:wght@400;500;600;700',
		'Inter:wght@400;500;600;700',
		'Roboto:wght@400;500;700',
		'Nunito:wght@400;500;600;700',
		'JetBrains+Mono:wght@400;500',
		'Fira+Code:wght@400;500',
		'Source+Code+Pro:wght@400;500',
	];
	return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
}
