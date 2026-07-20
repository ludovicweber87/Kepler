'use client';

import { useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { getTheme } from '@/theme/theme';
import { ColorModeProvider, useColorMode } from '@/hooks/useColorMode';
import { ThemePrefsProvider, useThemePrefs } from '@/hooks/useThemePrefs';
import { rootFontSizePx } from '@/lib/appFontScale';

function ThemeProviderInner({ children }: { children: React.ReactNode }) {
	const { variant } = useColorMode();
	const { prefs } = useThemePrefs();
	const theme = useMemo(() => getTheme(variant, prefs), [variant, prefs]);
	const rootPx = rootFontSizePx(prefs.appFontSize);

	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<GlobalStyles styles={{ html: { fontSize: `${rootPx}px` } }} />
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
