'use client';

import { createTheme, type PaletteMode } from '@mui/material/styles';

export function getTheme(mode: PaletteMode) {
	const isDark = mode === 'dark';

	return createTheme({
		palette: {
			mode,
			primary: {
				main: isDark ? '#7C5CFF' : '#8B7EC8',
				light: isDark ? '#9A84FF' : '#A99BC8',
				dark: isDark ? '#6B4CF0' : '#6E62A6',
			},
			secondary: {
				main: isDark ? '#00D4FF' : '#7A9E8E',
				light: isDark ? '#CCF6FF' : '#A3C4B5',
				dark: isDark ? '#00B8E6' : '#5F8272',
			},
			background: {
				default: isDark ? '#1A1A1A' : '#F5F1EB',
				paper: isDark ? '#222222' : '#FDFBF8',
			},
			error: {
				main: isDark ? '#EF4444' : '#C76A5B',
			},
			warning: {
				main: isDark ? '#F59E0B' : '#D4A24C',
			},
			success: {
				main: isDark ? '#22C55E' : '#6BA368',
			},
			info: {
				main: isDark ? '#00D4FF' : '#7BA4B8',
			},
			text: {
				primary: isDark ? '#FFFFFF' : '#3D3529',
				secondary: isDark ? '#B3B3B3' : '#8A7F72',
			},
			divider: isDark ? '#3A3A3A' : '#E2DCD3',
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
				color: isDark ? '#B3B3B3' : '#8A7F72',
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
						backgroundColor: isDark ? '#222222' : '#FDFBF8',
						border: `1px solid ${isDark ? '#3A3A3A' : '#E2DCD3'}`,
						borderRadius: 10,
						transition: 'background-color 0.2s ease, border-color 0.2s ease',
						'&:hover': {
							backgroundColor: isDark ? '#2A2A2A' : '#F7F3ED',
							borderColor: isDark ? '#444444' : '#D8D2C8',
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
						backgroundColor: isDark ? '#1A1A1A' : '#EDE8E0',
						borderRight: `1px solid ${isDark ? '#3A3A3A' : '#E2DCD3'}`,
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
