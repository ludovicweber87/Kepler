'use client';

import { createTheme, type PaletteMode } from '@mui/material/styles';

export function getTheme(mode: PaletteMode) {
	const isDark = mode === 'dark';

	return createTheme({
		palette: {
			mode,
			primary: {
				main: '#7C5CFF',
				light: '#9A84FF',
				dark: '#6B4CF0',
			},
			secondary: {
				main: isDark ? '#00D4FF' : '#0891B2',
				light: isDark ? '#CCF6FF' : '#67E8F9',
				dark: isDark ? '#00B8E6' : '#0E7490',
			},
			background: {
				default: isDark ? '#1A1A1A' : '#F0EBE0',
				paper: isDark ? '#222222' : '#FAF7F2',
			},
			error: {
				main: '#EF4444',
			},
			warning: {
				main: '#F59E0B',
			},
			success: {
				main: '#22C55E',
			},
			info: {
				main: '#00D4FF',
			},
			text: {
				primary: isDark ? '#FFFFFF' : '#2C2416',
				secondary: isDark ? '#B3B3B3' : '#7A7060',
			},
			divider: isDark ? '#3A3A3A' : '#DDD5C8',
		},
		typography: {
			fontSize: 12,
			fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
			h4: {
				fontWeight: 700,
				letterSpacing: '-0.02em',
			},
			h5: {
				fontWeight: 600,
				letterSpacing: '-0.01em',
			},
			h6: {
				fontWeight: 600,
			},
			subtitle1: {
				fontWeight: 500,
			},
			body2: {
				color: isDark ? '#B3B3B3' : '#7A7060',
			},
		},
		shape: {
			borderRadius: 8,
		},
		components: {
			MuiCard: {
				styleOverrides: {
					root: {
						backgroundImage: 'none',
						backgroundColor: isDark ? '#222222' : '#FAF7F2',
						border: `1px solid ${isDark ? '#3A3A3A' : '#DDD5C8'}`,
						borderRadius: 10,
						transition: 'background-color 0.2s ease, border-color 0.2s ease',
						'&:hover': {
							backgroundColor: isDark ? '#2A2A2A' : '#F5F0E8',
							borderColor: isDark ? '#444444' : '#D0C8BA',
						},
					},
				},
			},
			MuiChip: {
				styleOverrides: {
					root: {
						fontWeight: 500,
						fontSize: '0.75rem',
						border: 'none',
					},
				},
			},
			MuiDrawer: {
				styleOverrides: {
					paper: {
						backgroundImage: 'none',
						backgroundColor: isDark ? '#1A1A1A' : '#EDE8DC',
						borderRight: `1px solid ${isDark ? '#3A3A3A' : '#DDD5C8'}`,
					},
				},
			},
			MuiAppBar: {
				styleOverrides: {
					root: {
						backgroundImage: 'none',
						borderBottom: 'none',
					},
				},
			},
			MuiDialog: {
				styleOverrides: {
					paper: {
						backgroundImage: 'none',
						border: 'none',
					},
				},
			},
			MuiTabs: {
				styleOverrides: {
					indicator: {
						borderRadius: 1,
						height: 3,
					},
				},
			},
			MuiTab: {
				styleOverrides: {
					root: {
						textTransform: 'none' as const,
						fontWeight: 500,
						minHeight: 40,
					},
				},
			},
		},
	});
}

const theme = getTheme('dark');
export default theme;
