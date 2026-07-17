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
	| 'light-warm'
	| 'light-solarized'
	| 'light-near-white'
	| 'custom';

export const PRESET_VARIANTS: ThemeVariant[] = [
	'dark',
	'light-warm',
	'light-solarized',
	'light-near-white',
];

export const THEME_VARIANTS: ThemeVariant[] = [...PRESET_VARIANTS, 'custom'];

export const DEFAULT_THEME_VARIANT: ThemeVariant = 'dark';

/** [primary, secondary] pair used to render the variant swatch in the theme picker. */
export const THEME_VARIANT_SWATCH: Record<ThemeVariant, [string, string]> = {
	dark: ['#7C5CFF', '#00D4FF'],
	'light-warm': ['#5E4FA6', '#3F6D5A'],
	'light-solarized': ['#1E6FA8', '#1B7A72'],
	'light-near-white': ['#6E5FB0', '#4F7D6B'],
	custom: ['#7C5CFF', '#00D4FF'],
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
	'light-warm': {
		mode: 'light',
		chipStyle: 'tinted',
		primary: { main: '#5E4FA6', light: '#8B7EC8', dark: '#493C82' },
		secondary: { main: '#3F6D5A', light: '#5E8C7A', dark: '#2E5040' },
		error: '#A5382A',
		warning: '#8A6416',
		success: '#4A7546',
		info: '#356F8C',
		background: { default: '#F3EEE4', paper: '#FBF7EF' },
		text: { primary: '#33302A', secondary: '#6E685C' },
		divider: '#E4DDD0',
		surfaces: {
			cardHover: '#F6F1E8',
			cardBorderHover: '#D8D0C1',
			drawer: '#EDE7DB',
			drawerBorder: '#E4DDD0',
		},
	},
	'light-solarized': {
		mode: 'light',
		chipStyle: 'tinted',
		primary: { main: '#1E6FA8', light: '#4A97CE', dark: '#155680' },
		secondary: { main: '#1B7A72', light: '#2AA198', dark: '#125952' },
		error: '#C42B27',
		warning: '#8A6800',
		success: '#5F6E00',
		info: '#1E6FA8',
		background: { default: '#EEE8D5', paper: '#FDF6E3' },
		text: { primary: '#4A5C63', secondary: '#556B72' },
		divider: '#E3DCC6',
		surfaces: {
			cardHover: '#F7F0DC',
			cardBorderHover: '#D8CFB6',
			drawer: '#E4DDC8',
			drawerBorder: '#E3DCC6',
		},
	},
	'light-near-white': {
		mode: 'light',
		chipStyle: 'filled',
		primary: { main: '#6E5FB0', light: '#8B7EC8', dark: '#564A8C' },
		secondary: { main: '#4F7D6B', light: '#6FA08D', dark: '#3B5E50' },
		error: '#B23B2B',
		warning: '#8A6416',
		success: '#4F7D4C',
		info: '#3F7A99',
		background: { default: '#F7F4EE', paper: '#FDFCFA' },
		text: { primary: '#33302A', secondary: '#6E685C' },
		divider: '#ECE7DE',
		surfaces: {
			cardHover: '#F6F2EB',
			cardBorderHover: '#DFD8CC',
			drawer: '#EFEAE1',
			drawerBorder: '#ECE7DE',
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
