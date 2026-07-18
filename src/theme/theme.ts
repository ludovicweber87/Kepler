'use client';

import { createTheme, alpha, lighten, darken, type PaletteMode } from '@mui/material/styles';
import {
	appFontStack,
	DEFAULT_CUSTOM_TOKENS,
	type CustomThemeTokens,
	type ThemePrefs,
} from '@/lib/themePrefs';

export type ThemeVariant =
	| 'dark'
	| 'dark-teal'
	| 'dark-amber'
	| 'light-warm'
	| 'light-cool'
	| 'light-bright'
	| 'custom';

export const PRESET_VARIANTS: ThemeVariant[] = [
	'dark',
	'dark-teal',
	'dark-amber',
	'light-warm',
	'light-cool',
	'light-bright',
];

export const THEME_VARIANTS: ThemeVariant[] = [...PRESET_VARIANTS, 'custom'];

export const DEFAULT_THEME_VARIANT: ThemeVariant = 'dark';

/** [background, primary] pair used to render the variant swatch: left half signals
 * dark/light mode (the surface), right half shows the primary accent. */
export const THEME_VARIANT_SWATCH: Record<ThemeVariant, [string, string]> = {
	dark: ['#1A1A1A', '#7C5CFF'],
	'dark-teal': ['#0F1E1B', '#2DD4BF'],
	'dark-amber': ['#1B1611', '#FFB74D'],
	'light-warm': ['#F4EEE2', '#B0552F'],
	'light-cool': ['#ECEEF1', '#2563EB'],
	'light-bright': ['#FCFCFD', '#6E5FB0'],
	custom: ['#222222', '#7C5CFF'],
};

type ColorShades = { main: string; light: string; dark: string };
type ChipStyle = 'filled' | 'tinted';

interface VariantTokens {
	mode: PaletteMode;
	chipStyle: ChipStyle;
	primary: ColorShades;
	secondary: ColorShades;
	error: string;
	warning: string;
	success: string;
	info: string;
	background: { default: string; paper: string };
	text: { primary: string; secondary: string };
	divider: string;
	surfaces: {
		cardHover: string;
		cardBorderHover: string;
		drawer: string;
		drawerBorder: string;
	};
}

const TOKENS: Record<Exclude<ThemeVariant, 'custom'>, VariantTokens> = {
	dark: {
		mode: 'dark',
		chipStyle: 'filled',
		primary: { main: '#7C5CFF', light: '#9A84FF', dark: '#6B4CF0' },
		secondary: { main: '#00D4FF', light: '#CCF6FF', dark: '#00B8E6' },
		error: '#EF4444',
		warning: '#F59E0B',
		success: '#22C55E',
		info: '#00D4FF',
		background: { default: '#1A1A1A', paper: '#222222' },
		text: { primary: '#FFFFFF', secondary: '#B3B3B3' },
		divider: '#3A3A3A',
		surfaces: {
			cardHover: '#2A2A2A',
			cardBorderHover: '#444444',
			drawer: '#1A1A1A',
			drawerBorder: '#3A3A3A',
		},
	},
	'dark-teal': {
		mode: 'dark',
		chipStyle: 'filled',
		primary: { main: '#2DD4BF', light: '#5EEAD4', dark: '#14B8A6' },
		secondary: { main: '#FBB562', light: '#FDD09A', dark: '#E0954A' },
		error: '#F87171',
		warning: '#FBBF24',
		success: '#34D399',
		info: '#38BDF8',
		background: { default: '#0F1E1B', paper: '#16302B' },
		text: { primary: '#E6F4F1', secondary: '#94B0AB' },
		divider: '#26443E',
		surfaces: {
			cardHover: '#1B352F',
			cardBorderHover: '#34544D',
			drawer: '#0F1E1B',
			drawerBorder: '#26443E',
		},
	},
	'dark-amber': {
		mode: 'dark',
		chipStyle: 'filled',
		primary: { main: '#FFB74D', light: '#FFCC80', dark: '#FB8C00' },
		secondary: { main: '#4FC3F7', light: '#81D4FA', dark: '#0EA5E9' },
		error: '#EF5350',
		warning: '#FFA726',
		success: '#66BB6A',
		info: '#4FC3F7',
		background: { default: '#1B1611', paper: '#292019' },
		text: { primary: '#F4ECE1', secondary: '#B4A692' },
		divider: '#3B3123',
		surfaces: {
			cardHover: '#2B2219',
			cardBorderHover: '#4B3B29',
			drawer: '#1B1611',
			drawerBorder: '#3B3123',
		},
	},
	'light-warm': {
		mode: 'light',
		chipStyle: 'tinted',
		primary: { main: '#B0552F', light: '#CC7757', dark: '#8C4123' },
		secondary: { main: '#636D36', light: '#8B9755', dark: '#4A5228' },
		error: '#A5382A',
		warning: '#8A6416',
		success: '#4A7546',
		info: '#356F8C',
		background: { default: '#F4EEE2', paper: '#FCF8F0' },
		text: { primary: '#33302A', secondary: '#6E685C' },
		divider: '#E4DDCE',
		surfaces: {
			cardHover: '#F7F1E7',
			cardBorderHover: '#DCD2C0',
			drawer: '#EDE6D9',
			drawerBorder: '#E4DDCE',
		},
	},
	'light-cool': {
		mode: 'light',
		chipStyle: 'tinted',
		primary: { main: '#2563EB', light: '#5B8DEF', dark: '#1D4FBF' },
		secondary: { main: '#0F766E', light: '#2A9187', dark: '#0B564F' },
		error: '#C42B27',
		warning: '#92660A',
		success: '#3F7A46',
		info: '#2563EB',
		background: { default: '#ECEEF1', paper: '#F8F9FB' },
		text: { primary: '#2B2F36', secondary: '#5C636E' },
		divider: '#DDE1E7',
		surfaces: {
			cardHover: '#F1F3F6',
			cardBorderHover: '#CDD3DB',
			drawer: '#E6E8EC',
			drawerBorder: '#DDE1E7',
		},
	},
	'light-bright': {
		mode: 'light',
		chipStyle: 'filled',
		primary: { main: '#6E5FB0', light: '#8B7EC8', dark: '#564A8C' },
		secondary: { main: '#4F7D6B', light: '#6FA08D', dark: '#3B5E50' },
		error: '#B23B2B',
		warning: '#8A6416',
		success: '#4F7D4C',
		info: '#3F7A99',
		background: { default: '#FCFCFD', paper: '#FFFFFF' },
		text: { primary: '#1F2430', secondary: '#616875' },
		divider: '#ECEEF2',
		surfaces: {
			cardHover: '#F6F7F9',
			cardBorderHover: '#E0E3E9',
			drawer: '#F7F8FA',
			drawerBorder: '#ECEEF2',
		},
	},
};

function tokensFromCustom(c: CustomThemeTokens): VariantTokens {
	return {
		mode: c.mode,
		chipStyle: 'filled',
		primary: { main: c.primary, light: lighten(c.primary, 0.2), dark: darken(c.primary, 0.15) },
		secondary: {
			main: c.secondary,
			light: lighten(c.secondary, 0.2),
			dark: darken(c.secondary, 0.15),
		},
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

export function getTheme(variant: ThemeVariant, prefs?: ThemePrefs) {
	const t =
		variant === 'custom'
			? tokensFromCustom(prefs?.customTokens ?? DEFAULT_CUSTOM_TOKENS)
			: (TOKENS[variant] ?? TOKENS[DEFAULT_THEME_VARIANT as Exclude<ThemeVariant, 'custom'>]);
	const tinted = t.chipStyle === 'tinted';

	const fontFamily = prefs
		? `${appFontStack(prefs.appFont)}`
		: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif';
	const fontSize = prefs?.appFontSize ?? 12;

	return createTheme({
		palette: {
			mode: t.mode,
			primary: t.primary,
			secondary: t.secondary,
			background: t.background,
			error: { main: t.error },
			warning: { main: t.warning },
			success: { main: t.success },
			info: { main: t.info },
			text: t.text,
			divider: t.divider,
		},
		typography: {
			fontSize,
			fontFamily,
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
				color: t.text.secondary,
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
						backgroundColor: t.background.paper,
						border: `1px solid ${t.divider}`,
						borderRadius: 10,
						transition: 'background-color 0.2s ease, border-color 0.2s ease',
						'&:hover': {
							backgroundColor: t.surfaces.cardHover,
							borderColor: t.surfaces.cardBorderHover,
						},
					},
				},
			},
			MuiChip: {
				styleOverrides: {
					root: ({ ownerState, theme }) => {
						const base = {
							fontWeight: 500,
							fontSize: '0.75rem',
							border: 'none',
						};

						if (!tinted || ownerState.variant !== 'filled') {
							return base;
						}

						const color = ownerState.color;
						if (color && color !== 'default') {
							const shade = theme.palette[color].main;
							return {
								...base,
								backgroundColor: alpha(shade, 0.16),
								color: shade,
								'& .MuiChip-icon, & .MuiChip-deleteIcon': {
									color: shade,
								},
							};
						}

						return {
							...base,
							backgroundColor: alpha(theme.palette.text.primary, 0.08),
							color: theme.palette.text.secondary,
						};
					},
				},
			},
			MuiDrawer: {
				styleOverrides: {
					paper: {
						backgroundImage: 'none',
						backgroundColor: t.surfaces.drawer,
						borderRight: `1px solid ${t.surfaces.drawerBorder}`,
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
					root: ({ theme }) => ({
						textTransform: 'none' as const,
						fontWeight: 500,
						minHeight: 40,
						color: theme.palette.text.secondary,
						transition: 'color 0.2s ease, background-color 0.2s ease',
						'&:hover': {
							color: theme.palette.text.primary,
							backgroundColor: alpha(theme.palette.primary.main, 0.06),
						},
						'&.Mui-selected': {
							color: theme.palette.primary.main,
							fontWeight: 600,
						},
					}),
				},
			},
		},
	});
}

const theme = getTheme(DEFAULT_THEME_VARIANT);
export default theme;
