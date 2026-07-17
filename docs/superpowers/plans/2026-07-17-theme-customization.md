# Theme Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Apparence" accordion in `/settings` letting the user define theme colors (via color squares), app + terminal font family and size, persisted in DB with a localStorage mirror and live preview.

**Architecture:** A 5th editable `custom` theme variant is added to `theme/theme.ts`; `getTheme(variant, prefs)` builds its palette from user tokens and applies global app typography. A `ThemePrefsProvider` mirrors DB (`app_settings.theme_prefs`) into localStorage for flash-free first paint and exposes live `preview()` + explicit `save()`. Terminals read the terminal font/size from the same provider.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, MUI 7, TanStack Query 5, xterm.js 6, next-intl 4, Vitest.

## Global Constraints

- Language of UI strings: never hardcode — use `next-intl` (`useTranslations`), add keys to all 5 locales (`en/fr/es/de/pt`) in `src/config/translate/`.
- Tests: pure logic only (Vitest, `*.test.ts`). UI/provider/wiring verified by `npm run lint` + `npx tsc --noEmit` + `npm run build` + manual run.
- Path alias `@/*` → `./src/*`. `"use client"` on all interactive components.
- Files use TAB indentation (match existing files exactly).
- Do not commit/push without explicit approval — commit locally per task only.
- Persistence split: active variant stays in `localStorage` (Header-driven, unchanged); Custom token definition + typography go to DB (`app_settings.theme_prefs`) with localStorage mirror.

---

### Task 1: Pure theme-prefs module

**Files:**
- Create: `src/lib/themePrefs.ts`
- Test: `src/lib/themePrefs.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type CustomThemeTokens = { mode: 'light' | 'dark'; primary: string; secondary: string; error: string; warning: string; success: string; info: string; backgroundDefault: string; backgroundPaper: string; textPrimary: string; textSecondary: string; divider: string; cardHover: string; cardBorderHover: string; drawer: string; drawerBorder: string }`
  - `type ThemePrefs = { customTokens: CustomThemeTokens; appFont: string; appFontSize: number; terminalFont: string; terminalFontSize: number }`
  - `const DEFAULT_CUSTOM_TOKENS: CustomThemeTokens`
  - `const DEFAULT_THEME_PREFS: ThemePrefs`
  - `const APP_FONTS: string[]`, `const TERMINAL_FONTS: string[]`
  - `const COLOR_TOKEN_KEYS: (keyof Omit<CustomThemeTokens, 'mode'>)[]`
  - `function normalizeThemePrefs(raw: unknown): ThemePrefs`
  - `function appFontStack(name: string): string`
  - `function terminalFontStack(name: string): string`
  - `function googleFontsHref(): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/themePrefs.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/themePrefs.test.ts`
Expected: FAIL — cannot find module `./themePrefs`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/themePrefs.ts`:

```ts
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
		appFontSize: clampSize(r.appFontSize, DEFAULT_THEME_PREFS.appFontSize),
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/themePrefs.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/themePrefs.ts src/lib/themePrefs.test.ts
git commit -m "$(cat <<'EOF'
feat(theme): module de préférences de thème (tokens, polices, normalisation)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Custom variant in the theme factory

**Files:**
- Modify: `src/theme/theme.ts`
- Modify (tests): `src/theme/theme.test.ts`

**Interfaces:**
- Consumes: `CustomThemeTokens`, `ThemePrefs`, `appFontStack`, `DEFAULT_CUSTOM_TOKENS` from `@/lib/themePrefs` (Task 1).
- Produces:
  - `ThemeVariant` now includes `'custom'`.
  - `const PRESET_VARIANTS: ThemeVariant[]` (the 4 presets, no `custom`).
  - `getTheme(variant: ThemeVariant, prefs?: ThemePrefs)` — same return type, `prefs` optional.

- [ ] **Step 1: Write the failing tests**

In `src/theme/theme.test.ts`, add these imports at the top (keep existing ones):

```ts
import { getTheme, THEME_VARIANTS, PRESET_VARIANTS, DEFAULT_THEME_VARIANT, type ThemeVariant } from './theme';
import { DEFAULT_THEME_PREFS } from '@/lib/themePrefs';
```

Replace the two existing loops that assume every listed variant is a preset so they iterate `PRESET_VARIANTS` instead of `THEME_VARIANTS`:
- In `'keeps body text readable (AA) on both surfaces for every variant'`, change `for (const v of THEME_VARIANTS)` → `for (const v of PRESET_VARIANTS)`.
- Update `const LIGHT_VARIANTS: ThemeVariant[] = THEME_VARIANTS.filter((v) => v !== 'dark');` → `PRESET_VARIANTS.filter((v) => v !== 'dark');`
- In `'maps each variant to the expected palette mode'`, change `for (const v of LIGHT_VARIANTS)` stays (now derived from presets).

Then append a new describe block:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/theme/theme.test.ts`
Expected: FAIL — `PRESET_VARIANTS` undefined + custom assertions fail.

- [ ] **Step 3: Implement the changes in `src/theme/theme.ts`**

3a. Update the type + lists near the top:

```ts
export type ThemeVariant = 'dark' | 'light-warm' | 'light-solarized' | 'light-near-white' | 'custom';

export const PRESET_VARIANTS: ThemeVariant[] = [
	'dark',
	'light-warm',
	'light-solarized',
	'light-near-white',
];

export const THEME_VARIANTS: ThemeVariant[] = [...PRESET_VARIANTS, 'custom'];
```

3b. Add a swatch entry for custom (uses the default seed pair):

```ts
export const THEME_VARIANT_SWATCH: Record<ThemeVariant, [string, string]> = {
	dark: ['#7C5CFF', '#00D4FF'],
	'light-warm': ['#5E4FA6', '#3F6D5A'],
	'light-solarized': ['#1E6FA8', '#1B7A72'],
	'light-near-white': ['#6E5FB0', '#4F7D6B'],
	custom: ['#7C5CFF', '#00D4FF'],
};
```

3c. Add imports at the top (after the MUI import):

```ts
import { createTheme, alpha, lighten, darken, type PaletteMode } from '@mui/material/styles';
import {
	appFontStack,
	type CustomThemeTokens,
	type ThemePrefs,
} from '@/lib/themePrefs';
```

3d. Add a helper that turns `CustomThemeTokens` into the existing `VariantTokens` shape, placed just above `getTheme`:

```ts
function tokensFromCustom(c: CustomThemeTokens): VariantTokens {
	return {
		mode: c.mode,
		chipStyle: 'filled',
		primary: { main: c.primary, light: lighten(c.primary, 0.2), dark: darken(c.primary, 0.15) },
		secondary: { main: c.secondary, light: lighten(c.secondary, 0.2), dark: darken(c.secondary, 0.15) },
		error: c.error,
		warning: c.warning,
		success: c.success,
		info: c.info,
		background: { default: c.backgroundDefault, paper: c.backgroundPaper },
		text: { primary: c.textPrimary, secondary: c.textSecondary },
		divider: c.divider,
		surfaces: {
			cardHover: c.cardHover,
			cardBorderHover: c.cardBorderHover,
			drawer: c.drawer,
			drawerBorder: c.drawerBorder,
		},
	};
}
```

3e. Change the `getTheme` signature and token resolution. Replace the first lines of `getTheme`:

```ts
export function getTheme(variant: ThemeVariant, prefs?: ThemePrefs) {
	const t =
		variant === 'custom'
			? tokensFromCustom(prefs?.customTokens ?? tokensToCustom())
			: TOKENS[variant] ?? TOKENS[DEFAULT_THEME_VARIANT];
	const tinted = t.chipStyle === 'tinted';

	const fontFamily = prefs
		? `${appFontStack(prefs.appFont)}`
		: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif';
	const fontSize = prefs?.appFontSize ?? 12;
```

Where `tokensToCustom()` provides the default custom seed if no prefs. Add this tiny helper next to `tokensFromCustom`:

```ts
import { DEFAULT_CUSTOM_TOKENS } from '@/lib/themePrefs';
function tokensToCustom(): CustomThemeTokens {
	return DEFAULT_CUSTOM_TOKENS;
}
```

(Combine the two `@/lib/themePrefs` imports into one import statement.)

3f. In the `typography` block of the returned `createTheme`, replace the hardcoded `fontSize` and `fontFamily` lines with the computed values:

```ts
		typography: {
			fontSize,
			fontFamily,
			h4: { fontWeight: 700, letterSpacing: '-0.02em' },
			h5: { fontWeight: 600, letterSpacing: '-0.01em' },
			h6: { fontWeight: 600 },
			subtitle1: { fontWeight: 500 },
			body2: { color: t.text.secondary },
		},
```

(Keep the rest of the theme object — `shape`, `components` — unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/theme/theme.test.ts`
Expected: PASS (existing preset checks + new custom checks).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/theme/theme.ts src/theme/theme.test.ts
git commit -m "$(cat <<'EOF'
feat(theme): variante custom éditable + typo pilotée par les prefs

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: ThemePrefsProvider (DB + localStorage mirror, live preview)

**Files:**
- Create: `src/hooks/useThemePrefs.tsx`

**Interfaces:**
- Consumes: `ThemePrefs`, `DEFAULT_THEME_PREFS`, `normalizeThemePrefs` from `@/lib/themePrefs`; `apiFetch` from `@/lib/api-fetch`.
- Produces:
  - `ThemePrefsProvider({ children })`
  - `useThemePrefs(): { prefs: ThemePrefs; preview: (next: ThemePrefs) => void; resetPreview: () => void; save: (next: ThemePrefs) => Promise<void>; isSaving: boolean }`

- [ ] **Step 1: Create the provider**

Create `src/hooks/useThemePrefs.tsx`:

```tsx
'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { DEFAULT_THEME_PREFS, normalizeThemePrefs, type ThemePrefs } from '@/lib/themePrefs';

const STORAGE_KEY = 'devora-theme-prefs';
const CHANGE_EVENT = 'devora-theme-prefs-change';
const DB_KEY = 'theme_prefs';

interface ThemePrefsContextValue {
	prefs: ThemePrefs;
	preview: (next: ThemePrefs) => void;
	resetPreview: () => void;
	save: (next: ThemePrefs) => Promise<void>;
	isSaving: boolean;
}

const ThemePrefsContext = createContext<ThemePrefsContextValue>({
	prefs: DEFAULT_THEME_PREFS,
	preview: () => {},
	resetPreview: () => {},
	save: async () => {},
	isSaving: false,
});

// Cached snapshot so useSyncExternalStore keeps a stable reference.
let cachedRaw: string | null = null;
let cachedPrefs: ThemePrefs = DEFAULT_THEME_PREFS;

function getSnapshot(): ThemePrefs {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw !== cachedRaw) {
		cachedRaw = raw;
		try {
			cachedPrefs = normalizeThemePrefs(raw ? JSON.parse(raw) : null);
		} catch {
			cachedPrefs = DEFAULT_THEME_PREFS;
		}
	}
	return cachedPrefs;
}

const getServerSnapshot = (): ThemePrefs => DEFAULT_THEME_PREFS;

function subscribe(callback: () => void) {
	window.addEventListener('storage', callback);
	window.addEventListener(CHANGE_EVENT, callback);
	return () => {
		window.removeEventListener('storage', callback);
		window.removeEventListener(CHANGE_EVENT, callback);
	};
}

function writeStorage(value: string) {
	localStorage.setItem(STORAGE_KEY, value);
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemePrefsProvider({ children }: { children: ReactNode }) {
	const qc = useQueryClient();
	const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const [previewPrefs, setPreviewPrefs] = useState<ThemePrefs | null>(null);

	const { data } = useQuery({
		queryKey: ['app-setting', DB_KEY],
		queryFn: async () => {
			const res = await apiFetch(`/api/settings?key=${DB_KEY}`);
			if (!res.ok) throw new Error('Failed to fetch theme prefs');
			const { value } = (await res.json()) as { value: string | null };
			return value;
		},
	});

	// Reconcile the DB value into localStorage (source of truth for first paint).
	useEffect(() => {
		if (data == null) return;
		if (data !== localStorage.getItem(STORAGE_KEY)) writeStorage(data);
	}, [data]);

	const mutation = useMutation({
		mutationFn: async (next: ThemePrefs) => {
			const value = JSON.stringify(next);
			const res = await apiFetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: DB_KEY, value }),
			});
			if (!res.ok) throw new Error('Failed to save theme prefs');
			return value;
		},
		onSuccess: (value) => {
			writeStorage(value);
			qc.setQueryData(['app-setting', DB_KEY], value);
		},
	});

	const preview = useCallback((next: ThemePrefs) => setPreviewPrefs(next), []);
	const resetPreview = useCallback(() => setPreviewPrefs(null), []);
	const save = useCallback(
		async (next: ThemePrefs) => {
			await mutation.mutateAsync(next);
			setPreviewPrefs(null);
		},
		[mutation],
	);

	const prefs = previewPrefs ?? stored;

	const value = useMemo(
		() => ({ prefs, preview, resetPreview, save, isSaving: mutation.isPending }),
		[prefs, preview, resetPreview, save, mutation.isPending],
	);

	return <ThemePrefsContext.Provider value={value}>{children}</ThemePrefsContext.Provider>;
}

export function useThemePrefs() {
	return useContext(ThemePrefsContext);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint src/hooks/useThemePrefs.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useThemePrefs.tsx
git commit -m "$(cat <<'EOF'
feat(theme): provider de préférences (DB + miroir localStorage, aperçu live)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire the provider into ThemeRegistry + load fonts

**Files:**
- Modify: `src/components/ThemeRegistry.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `ThemePrefsProvider`, `useThemePrefs` (Task 3); `getTheme` with prefs (Task 2); `googleFontsHref` (Task 1).
- Produces: the whole app tree now renders under `ThemePrefsProvider`, and `getTheme(variant, prefs)` is used.

- [ ] **Step 1: Update `src/components/ThemeRegistry.tsx`**

Replace the file body with:

```tsx
'use client';

import { useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { getTheme } from '@/theme/theme';
import { ColorModeProvider, useColorMode } from '@/hooks/useColorMode';
import { ThemePrefsProvider, useThemePrefs } from '@/hooks/useThemePrefs';

function ThemeProviderInner({ children }: { children: React.ReactNode }) {
	const { variant } = useColorMode();
	const { prefs } = useThemePrefs();
	const theme = useMemo(() => getTheme(variant, prefs), [variant, prefs]);

	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			{children}
		</ThemeProvider>
	);
}

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
	return (
		<ColorModeProvider>
			<ThemePrefsProvider>
				<ThemeProviderInner>{children}</ThemeProviderInner>
			</ThemePrefsProvider>
		</ColorModeProvider>
	);
}
```

- [ ] **Step 2: Update the font `<link>` in `src/app/layout.tsx`**

Replace the single Poppins `<link href=...>` line inside `<head>` with a computed href covering all curated Google families. Add the import at the top:

```tsx
import { googleFontsHref } from '@/lib/themePrefs';
```

And replace the stylesheet link:

```tsx
				<link href={googleFontsHref()} rel="stylesheet" />
```

(Keep the two `preconnect` links unchanged.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ThemeRegistry.tsx src/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(theme): branche le provider de prefs et charge les polices curated

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Apply terminal font/size from prefs

**Files:**
- Modify: `src/components/agents/ShellTerminal.tsx`
- Modify: `src/components/layout/OverlayTerminal.tsx`

**Interfaces:**
- Consumes: `useThemePrefs` (Task 3), `terminalFontStack` (Task 1). Both files already hold the xterm instance in `terminalRef` and the fit addon in `fitAddonRef`.

- [ ] **Step 1: Update `ShellTerminal.tsx`**

1a. Add imports near the other imports:

```tsx
import { useThemePrefs } from '@/hooks/useThemePrefs';
import { terminalFontStack } from '@/lib/themePrefs';
```

1b. Inside the component body (near the other hooks), read prefs:

```tsx
	const { prefs } = useThemePrefs();
```

1c. In the `new Terminal({ ... })` call, replace the hardcoded font lines:

```tsx
			fontSize: prefs.terminalFontSize,
			fontFamily: terminalFontStack(prefs.terminalFont),
```

1d. Add an effect (place it next to the existing `xtermTheme` effect around line 199) to react to changes:

```tsx
	useEffect(() => {
		const term = terminalRef.current;
		if (!term) return;
		term.options.fontFamily = terminalFontStack(prefs.terminalFont);
		term.options.fontSize = prefs.terminalFontSize;
		fitAddonRef.current?.fit();
	}, [prefs.terminalFont, prefs.terminalFontSize]);
```

- [ ] **Step 2: Update `OverlayTerminal.tsx`**

2a. Add the same imports:

```tsx
import { useThemePrefs } from '@/hooks/useThemePrefs';
import { terminalFontStack } from '@/lib/themePrefs';
```

2b. In the component body add:

```tsx
	const { prefs } = useThemePrefs();
```

2c. In the `new Terminal({ ... })` call replace the hardcoded font lines:

```tsx
			fontSize: prefs.terminalFontSize,
			fontFamily: terminalFontStack(prefs.terminalFont),
```

2d. Add a reactive effect after the terminal-setup effect:

```tsx
	useEffect(() => {
		const term = terminalRef.current;
		if (!term) return;
		term.options.fontFamily = terminalFontStack(prefs.terminalFont);
		term.options.fontSize = prefs.terminalFontSize;
		fitAddonRef.current?.fit();
	}, [prefs.terminalFont, prefs.terminalFontSize]);
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/agents/ShellTerminal.tsx src/components/layout/OverlayTerminal.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/agents/ShellTerminal.tsx src/components/layout/OverlayTerminal.tsx
git commit -m "$(cat <<'EOF'
feat(terminal): police et taille pilotées par les préférences de thème

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: i18n — `appearance` namespace (5 locales)

**Files:**
- Modify: `src/config/translate/fr.json`
- Modify: `src/config/translate/en.json`
- Modify: `src/config/translate/es.json`
- Modify: `src/config/translate/de.json`
- Modify: `src/config/translate/pt.json`

**Interfaces:**
- Produces: an `appearance` namespace with keys `title`, `variant`, `variantCustom`, `customColors`, `mode`, `modeLight`, `modeDark`, `typography`, `appFont`, `appFontSize`, `terminalFont`, `terminalFontSize`, `save`, `saved`, and a nested `colors` object keyed by every entry of `COLOR_TOKEN_KEYS`.

- [ ] **Step 1: Add the block to `fr.json`** (insert as a new top-level key, e.g. after `"settings"`):

```json
	"appearance": {
		"title": "Apparence",
		"variant": "Thème",
		"variantCustom": "Personnalisé",
		"customColors": "Couleurs personnalisées",
		"mode": "Mode",
		"modeLight": "Clair",
		"modeDark": "Sombre",
		"typography": "Typographie",
		"appFont": "Police de l'application",
		"appFontSize": "Taille (application)",
		"terminalFont": "Police du terminal",
		"terminalFontSize": "Taille (terminal)",
		"save": "Enregistrer",
		"saved": "Apparence enregistrée",
		"colors": {
			"primary": "Primaire",
			"secondary": "Secondaire",
			"error": "Erreur",
			"warning": "Avertissement",
			"success": "Succès",
			"info": "Info",
			"backgroundDefault": "Fond",
			"backgroundPaper": "Surface",
			"textPrimary": "Texte principal",
			"textSecondary": "Texte secondaire",
			"divider": "Séparateur",
			"cardHover": "Survol carte",
			"cardBorderHover": "Bordure carte (survol)",
			"drawer": "Panneau latéral",
			"drawerBorder": "Bordure panneau"
		}
	},
```

- [ ] **Step 2: Add to `en.json`:**

```json
	"appearance": {
		"title": "Appearance",
		"variant": "Theme",
		"variantCustom": "Custom",
		"customColors": "Custom colors",
		"mode": "Mode",
		"modeLight": "Light",
		"modeDark": "Dark",
		"typography": "Typography",
		"appFont": "App font",
		"appFontSize": "Size (app)",
		"terminalFont": "Terminal font",
		"terminalFontSize": "Size (terminal)",
		"save": "Save",
		"saved": "Appearance saved",
		"colors": {
			"primary": "Primary",
			"secondary": "Secondary",
			"error": "Error",
			"warning": "Warning",
			"success": "Success",
			"info": "Info",
			"backgroundDefault": "Background",
			"backgroundPaper": "Surface",
			"textPrimary": "Text primary",
			"textSecondary": "Text secondary",
			"divider": "Divider",
			"cardHover": "Card hover",
			"cardBorderHover": "Card border (hover)",
			"drawer": "Sidebar",
			"drawerBorder": "Sidebar border"
		}
	},
```

- [ ] **Step 3: Add to `es.json`:**

```json
	"appearance": {
		"title": "Apariencia",
		"variant": "Tema",
		"variantCustom": "Personalizado",
		"customColors": "Colores personalizados",
		"mode": "Modo",
		"modeLight": "Claro",
		"modeDark": "Oscuro",
		"typography": "Tipografía",
		"appFont": "Fuente de la app",
		"appFontSize": "Tamaño (app)",
		"terminalFont": "Fuente del terminal",
		"terminalFontSize": "Tamaño (terminal)",
		"save": "Guardar",
		"saved": "Apariencia guardada",
		"colors": {
			"primary": "Primario",
			"secondary": "Secundario",
			"error": "Error",
			"warning": "Advertencia",
			"success": "Éxito",
			"info": "Info",
			"backgroundDefault": "Fondo",
			"backgroundPaper": "Superficie",
			"textPrimary": "Texto principal",
			"textSecondary": "Texto secundario",
			"divider": "Separador",
			"cardHover": "Hover tarjeta",
			"cardBorderHover": "Borde tarjeta (hover)",
			"drawer": "Barra lateral",
			"drawerBorder": "Borde barra lateral"
		}
	},
```

- [ ] **Step 4: Add to `de.json`:**

```json
	"appearance": {
		"title": "Erscheinungsbild",
		"variant": "Thema",
		"variantCustom": "Benutzerdefiniert",
		"customColors": "Benutzerdefinierte Farben",
		"mode": "Modus",
		"modeLight": "Hell",
		"modeDark": "Dunkel",
		"typography": "Typografie",
		"appFont": "App-Schriftart",
		"appFontSize": "Größe (App)",
		"terminalFont": "Terminal-Schriftart",
		"terminalFontSize": "Größe (Terminal)",
		"save": "Speichern",
		"saved": "Erscheinungsbild gespeichert",
		"colors": {
			"primary": "Primär",
			"secondary": "Sekundär",
			"error": "Fehler",
			"warning": "Warnung",
			"success": "Erfolg",
			"info": "Info",
			"backgroundDefault": "Hintergrund",
			"backgroundPaper": "Oberfläche",
			"textPrimary": "Text primär",
			"textSecondary": "Text sekundär",
			"divider": "Trenner",
			"cardHover": "Karte Hover",
			"cardBorderHover": "Kartenrand (Hover)",
			"drawer": "Seitenleiste",
			"drawerBorder": "Seitenleistenrand"
		}
	},
```

- [ ] **Step 5: Add to `pt.json`:**

```json
	"appearance": {
		"title": "Aparência",
		"variant": "Tema",
		"variantCustom": "Personalizado",
		"customColors": "Cores personalizadas",
		"mode": "Modo",
		"modeLight": "Claro",
		"modeDark": "Escuro",
		"typography": "Tipografia",
		"appFont": "Fonte da app",
		"appFontSize": "Tamanho (app)",
		"terminalFont": "Fonte do terminal",
		"terminalFontSize": "Tamanho (terminal)",
		"save": "Guardar",
		"saved": "Aparência guardada",
		"colors": {
			"primary": "Primário",
			"secondary": "Secundário",
			"error": "Erro",
			"warning": "Aviso",
			"success": "Sucesso",
			"info": "Info",
			"backgroundDefault": "Fundo",
			"backgroundPaper": "Superfície",
			"textPrimary": "Texto principal",
			"textSecondary": "Texto secundário",
			"divider": "Divisor",
			"cardHover": "Hover cartão",
			"cardBorderHover": "Borda cartão (hover)",
			"drawer": "Barra lateral",
			"drawerBorder": "Borda barra lateral"
		}
	},
```

- [ ] **Step 6: Validate JSON**

Run: `node -e "['en','fr','es','de','pt'].forEach(l=>{const j=require('./src/config/translate/'+l+'.json'); if(!j.appearance||!j.appearance.colors.drawerBorder) throw new Error('missing in '+l); }); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add src/config/translate/en.json src/config/translate/fr.json src/config/translate/es.json src/config/translate/de.json src/config/translate/pt.json
git commit -m "$(cat <<'EOF'
feat(i18n): namespace appearance pour la personnalisation du thème

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Appearance accordion UI

**Files:**
- Create: `src/components/settings/AppearanceSettings.tsx`
- Modify: `src/components/settings/SettingsPanel.tsx`

**Interfaces:**
- Consumes: `useColorMode` (variant/setVariant), `useThemePrefs` (Task 3), `THEME_VARIANTS`/`THEME_VARIANT_SWATCH` (Task 2), `APP_FONTS`/`TERMINAL_FONTS`/`COLOR_TOKEN_KEYS`/`ThemePrefs` (Task 1), `useSnackbar`.
- Produces: `<AppearanceSettings />` default export, rendered inside a new accordion in `SettingsPanel`.

- [ ] **Step 1: Create `src/components/settings/AppearanceSettings.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useColorMode } from '@/hooks/useColorMode';
import { useThemePrefs } from '@/hooks/useThemePrefs';
import { useSnackbar } from '@/hooks/useSnackbar';
import { THEME_VARIANTS, THEME_VARIANT_SWATCH, type ThemeVariant } from '@/theme/theme';
import { APP_FONTS, TERMINAL_FONTS, COLOR_TOKEN_KEYS, type ThemePrefs } from '@/lib/themePrefs';

export default function AppearanceSettings() {
	const theme = useTheme();
	const t = useTranslations('appearance');
	const { showSnackbar } = useSnackbar();
	const { variant, setVariant } = useColorMode();
	const { prefs, preview, resetPreview, save, isSaving } = useThemePrefs();

	const [draft, setDraft] = useState<ThemePrefs>(prefs);

	// Seed the draft from saved prefs once (localStorage is populated at first paint).
	useEffect(() => {
		setDraft(prefs);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Revert any unsaved live preview when leaving the panel.
	useEffect(() => () => resetPreview(), [resetPreview]);

	const update = (next: ThemePrefs) => {
		setDraft(next);
		preview(next);
	};

	const setColor = (key: (typeof COLOR_TOKEN_KEYS)[number], value: string) =>
		update({ ...draft, customTokens: { ...draft.customTokens, [key]: value } });

	const handleSave = async () => {
		await save(draft);
		showSnackbar(t('saved'), 'success');
	};

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
			{/* Variant selector */}
			<Box>
				<Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
					{t('variant')}
				</Typography>
				<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
					{THEME_VARIANTS.map((v) => {
						const [c1, c2] = THEME_VARIANT_SWATCH[v];
						const selected = v === variant;
						return (
							<Box
								key={v}
								onClick={() => setVariant(v as ThemeVariant)}
								sx={{
									width: 44,
									height: 44,
									borderRadius: 1.5,
									cursor: 'pointer',
									background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`,
									border: 2,
									borderColor: selected ? 'primary.main' : 'divider',
									boxShadow: selected ? 3 : 0,
									transition: 'all 0.15s ease',
								}}
							/>
						);
					})}
				</Box>
			</Box>

			{/* Custom colors (only when the custom variant is active) */}
			{variant === 'custom' && (
				<Box>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							mb: 1,
						}}
					>
						<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
							{t('customColors')}
						</Typography>
						<ToggleButtonGroup
							size="small"
							exclusive
							value={draft.customTokens.mode}
							onChange={(_e, mode) => {
								if (mode)
									update({
										...draft,
										customTokens: { ...draft.customTokens, mode },
									});
							}}
						>
							<ToggleButton value="light">{t('modeLight')}</ToggleButton>
							<ToggleButton value="dark">{t('modeDark')}</ToggleButton>
						</ToggleButtonGroup>
					</Box>
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
							gap: 1.5,
						}}
					>
						{COLOR_TOKEN_KEYS.map((key) => (
							<Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<Box
									component="input"
									type="color"
									value={draft.customTokens[key]}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
										setColor(key, e.target.value)
									}
									sx={{
										width: 28,
										height: 28,
										p: 0,
										border: 1,
										borderColor: 'divider',
										borderRadius: 1,
										bgcolor: 'transparent',
										cursor: 'pointer',
										flexShrink: 0,
										'&::-webkit-color-swatch-wrapper': { p: 0 },
										'&::-webkit-color-swatch': { border: 'none', borderRadius: 3 },
									}}
								/>
								<Typography variant="caption" color="text.secondary" noWrap>
									{t(`colors.${key}`)}
								</Typography>
							</Box>
						))}
					</Box>
				</Box>
			)}

			{/* Typography */}
			<Box>
				<Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
					{t('typography')}
				</Typography>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
						gap: 2,
					}}
				>
					<FontControl
						label={t('appFont')}
						sizeLabel={t('appFontSize')}
						fonts={APP_FONTS}
						font={draft.appFont}
						size={draft.appFontSize}
						onFont={(appFont) => update({ ...draft, appFont })}
						onSize={(appFontSize) => update({ ...draft, appFontSize })}
					/>
					<FontControl
						label={t('terminalFont')}
						sizeLabel={t('terminalFontSize')}
						fonts={TERMINAL_FONTS}
						font={draft.terminalFont}
						size={draft.terminalFontSize}
						onFont={(terminalFont) => update({ ...draft, terminalFont })}
						onSize={(terminalFontSize) => update({ ...draft, terminalFontSize })}
					/>
				</Box>
			</Box>

			<Box>
				<Button
					variant="contained"
					disabled={isSaving}
					onClick={handleSave}
					sx={{ bgcolor: alpha(theme.palette.primary.main, 1) }}
				>
					{t('save')}
				</Button>
			</Box>
		</Box>
	);
}

function FontControl({
	label,
	sizeLabel,
	fonts,
	font,
	size,
	onFont,
	onSize,
}: {
	label: string;
	sizeLabel: string;
	fonts: string[];
	font: string;
	size: number;
	onFont: (v: string) => void;
	onSize: (v: number) => void;
}) {
	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
			<Typography variant="caption" color="text.secondary">
				{label}
			</Typography>
			<Select size="small" value={font} onChange={(e) => onFont(e.target.value)}>
				{fonts.map((f) => (
					<MenuItem key={f} value={f} sx={{ fontFamily: f }}>
						{f}
					</MenuItem>
				))}
			</Select>
			<TextField
				size="small"
				type="number"
				label={sizeLabel}
				value={size}
				onChange={(e) => {
					const n = Number(e.target.value);
					if (!Number.isNaN(n)) onSize(n);
				}}
				slotProps={{ htmlInput: { min: 8, max: 32 } }}
			/>
		</Box>
	);
}
```

- [ ] **Step 2: Add the accordion in `src/components/settings/SettingsPanel.tsx`**

2a. Add imports near the other MUI/icon imports:

```tsx
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import AppearanceSettings from './AppearanceSettings';
```

2b. Insert a new `<Accordion>` inside the existing `<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>`, after the "GitHub Projects" accordion and before the closing `</Box>`:

```tsx
					{/* Accordion: Appearance */}
					<Accordion
						disableGutters
						sx={{
							bgcolor: 'transparent',
							boxShadow: 'none',
							'&:before': { display: 'none' },
							border: 1,
							borderColor: 'divider',
							borderRadius: '8px !important',
							overflow: 'hidden',
						}}
					>
						<AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2 }}>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
								<PaletteRoundedIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
								<Typography variant="h6" sx={{ fontWeight: 600 }}>
									{tAppearance('title')}
								</Typography>
							</Box>
						</AccordionSummary>
						<AccordionDetails sx={{ px: 2, pb: 2 }}>
							<AppearanceSettings />
						</AccordionDetails>
					</Accordion>
```

2c. Add the translations hook near the top of `SettingsPanel` (next to the existing `const t = useTranslations('settings');`):

```tsx
	const tAppearance = useTranslations('appearance');
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint src/components/settings/AppearanceSettings.tsx src/components/settings/SettingsPanel.tsx && npm run build`
Expected: all clean, build succeeds.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `http://localhost:4000/settings`, expand "Apparence":
- Select the "Custom" swatch → the color grid + mode toggle appear.
- Change a color → the app updates live (preview).
- Change app font/size and terminal font/size → app text and both terminals update live.
- Click "Enregistrer" → snackbar shows; reload the page → the saved theme persists with no flash of the default theme.
- Leave settings without saving after editing → theme reverts to the last saved state.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/AppearanceSettings.tsx src/components/settings/SettingsPanel.tsx
git commit -m "$(cat <<'EOF'
feat(settings): accordion Apparence (couleurs custom, typo, terminal)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Accordion in `/settings` → Task 7. ✓
- Define theme colors via color squares → Task 7 (color grid) + Task 2 (custom variant) + Task 1 (tokens). ✓
- Full color set editable → `COLOR_TOKEN_KEYS` (15 tokens) Task 1/7. ✓
- App font + size → Task 1 (lists), Task 2 (typography), Task 7 (controls). ✓
- Terminal font + size → Task 1, Task 5, Task 7. ✓
- Saved in DB → Task 3 (`app_settings.theme_prefs`). ✓
- DB + localStorage mirror, no flash → Task 3. ✓
- Live preview + single Save button → Task 3 (`preview`/`save`) + Task 7. ✓
- Custom = 5th variant, presets kept → Task 2. ✓
- Curated font lists via Google Fonts → Task 1 + Task 4. ✓
- i18n 5 locales → Task 6. ✓
- Pure-logic tests only → Tasks 1 & 2 have Vitest tests; UI/provider verified via tsc/lint/build/manual. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✓

**Type consistency:** `ThemePrefs`, `CustomThemeTokens`, `COLOR_TOKEN_KEYS`, `getTheme(variant, prefs)`, `useThemePrefs()` return shape (`prefs`/`preview`/`resetPreview`/`save`/`isSaving`), `terminalFontStack`, `appFontStack`, `googleFontsHref` — names identical across Tasks 1→7. ✓

## Notes / Risks

- Adding `custom` to `THEME_VARIANTS` would break the existing exhaustive AA-contrast test; Task 2 fixes this by introducing `PRESET_VARIANTS` and pointing the contrast/mode loops at it (custom is user-defined, so no AA guarantee).
- Cascadia Code and Menlo are not on Google Fonts; they rely on local/system availability, with fallbacks in `terminalFontStack`. This is acceptable and matches the current hardcoded behavior.
- `useSyncExternalStore` requires a cached snapshot for object values — handled by the module-level `cachedRaw`/`cachedPrefs` cache in Task 3.
