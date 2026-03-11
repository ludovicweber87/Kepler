'use client';

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import type { PaletteMode } from '@mui/material/styles';

interface ColorModeContextValue {
	mode: PaletteMode;
	toggleColorMode: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue>({
	mode: 'dark',
	toggleColorMode: () => {},
});

const STORAGE_KEY = 'devora-color-mode';

export function ColorModeProvider({ children }: { children: ReactNode }) {
	const [mode, setMode] = useState<PaletteMode>('dark');

	useEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'light' || stored === 'dark') {
			setMode(stored);
		}
	}, []);

	const toggleColorMode = useCallback(() => {
		setMode((prev) => {
			const next = prev === 'dark' ? 'light' : 'dark';
			localStorage.setItem(STORAGE_KEY, next);
			return next;
		});
	}, []);

	const value = useMemo(() => ({ mode, toggleColorMode }), [mode, toggleColorMode]);

	return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function useColorMode() {
	return useContext(ColorModeContext);
}
