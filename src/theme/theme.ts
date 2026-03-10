'use client';

import { createTheme } from '@mui/material/styles';

const theme = createTheme({
	palette: {
		mode: 'dark',
		primary: {
			main: '#7C5CFF',
			light: '#9A84FF',
			dark: '#6B4CF0',
		},
		secondary: {
			main: '#00D4FF',
			light: '#CCF6FF',
			dark: '#00B8E6',
		},
		background: {
			default: '#1A1A1A',
			paper: '#222222',
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
			primary: '#FFFFFF',
			secondary: '#B3B3B3',
		},
		divider: '#3A3A3A',
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
			color: '#B3B3B3',
		},
	},
	shape: {
		borderRadius: 16,
	},
	components: {
		MuiCard: {
			styleOverrides: {
				root: {
					backgroundImage: 'none',
					backgroundColor: '#222222',
					border: '1px solid #3A3A3A',
					borderRadius: 10,
					transition: 'background-color 0.2s ease, border-color 0.2s ease',
					'&:hover': {
						backgroundColor: '#2A2A2A',
						borderColor: '#444444',
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
					backgroundColor: '#1A1A1A',
					borderRight: '1px solid #3A3A3A',
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
					borderRadius: 2,
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

export default theme;
