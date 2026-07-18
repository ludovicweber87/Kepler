'use client';

import {
	createContext,
	useContext,
	useCallback,
	useMemo,
	useSyncExternalStore,
	type ReactNode,
} from 'react';
import type { PaletteMode } from '@mui/material/styles';
import { DEFAULT_THEME_VARIANT, THEME_VARIANTS, type ThemeVariant } from '@/theme/theme';

interface ColorModeContextValue {
	variant: ThemeVariant;
	setVariant: (variant: ThemeVariant) => void;
	mode: PaletteMode;
}

const ColorModeContext = createContext<ColorModeContextValue>({
	variant: DEFAULT_THEME_VARIANT,
	setVariant: () => {},
	mode: 'dark',
});

const STORAGE_KEY = 'devora-color-mode';
const CHANGE_EVENT = 'devora-color-mode-change';

/** Resolve a persisted value (including legacy 'light'/'dark') to a variant. */
export function resolveStoredVariant(stored: string | null): ThemeVariant {
	if (!stored) return DEFAULT_THEME_VARIANT;
	if (THEME_VARIANTS.includes(stored as ThemeVariant)) {
		return stored as ThemeVariant;
	}
	if (stored === 'light') return 'light-warm';
	if (stored === 'dark') return 'dark';
	// Legacy variant ids renamed in the theme refresh.
	if (stored === 'light-solarized') return 'light-cool';
	if (stored === 'light-near-white') return 'light-bright';
	return DEFAULT_THEME_VARIANT;
}

const modeForVariant = (variant: ThemeVariant): PaletteMode =>
	variant.startsWith('dark') ? 'dark' : 'light';

function subscribe(callback: () => void) {
	window.addEventListener('storage', callback);
	window.addEventListener(CHANGE_EVENT, callback);
	return () => {
		window.removeEventListener('storage', callback);
		window.removeEventListener(CHANGE_EVENT, callback);
	};
}

const getSnapshot = (): ThemeVariant => resolveStoredVariant(localStorage.getItem(STORAGE_KEY));

const getServerSnapshot = (): ThemeVariant => DEFAULT_THEME_VARIANT;

export function ColorModeProvider({ children }: { children: ReactNode }) {
	const variant = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const setVariant = useCallback((next: ThemeVariant) => {
		localStorage.setItem(STORAGE_KEY, next);
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	const value = useMemo(
		() => ({ variant, setVariant, mode: modeForVariant(variant) }),
		[variant, setVariant],
	);

	return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function useColorMode() {
	return useContext(ColorModeContext);
}
