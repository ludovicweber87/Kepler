'use client';

import { useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { getTheme } from '@/theme/theme';
import { ColorModeProvider, useColorMode } from '@/hooks/useColorMode';

function ThemeProviderInner({ children }: { children: React.ReactNode }) {
	const { mode } = useColorMode();
	const theme = useMemo(() => getTheme(mode), [mode]);

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
			<ThemeProviderInner>{children}</ThemeProviderInner>
		</ColorModeProvider>
	);
}
