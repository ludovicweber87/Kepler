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
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useTranslations } from 'next-intl';
import { useColorMode } from '@/hooks/useColorMode';
import { useThemePrefs } from '@/hooks/useThemePrefs';
import { useSnackbar } from '@/hooks/useSnackbar';
import { THEME_VARIANTS, THEME_VARIANT_SWATCH, type ThemeVariant } from '@/theme/theme';
import {
	APP_FONTS,
	TERMINAL_FONTS,
	COLOR_TOKEN_KEYS,
	normalizeHexInput,
	type ThemePrefs,
} from '@/lib/themePrefs';
import { APP_FONT_MIN, APP_FONT_MAX } from '@/lib/appFontScale';
import ColorPickerPopover from './ColorPickerPopover';

export default function AppearanceSettings() {
	const t = useTranslations('appearance');
	const { showSnackbar } = useSnackbar();
	const { variant, setVariant } = useColorMode();
	const { prefs, preview, resetPreview, save, isSaving } = useThemePrefs();

	const [draft, setDraft] = useState<ThemePrefs>(prefs);

	// Seed the draft from saved prefs once (localStorage is populated at first paint).
	useEffect(() => {
		setDraft(prefs);
	}, [prefs]);

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
						// Le thème custom n'a pas de couleur fixe : carré neutre « à définir ».
						const isCustom = v === 'custom';
						return (
							<Box
								key={v}
								role="button"
								tabIndex={0}
								aria-label={v}
								onClick={() => setVariant(v as ThemeVariant)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										if (e.key === ' ') e.preventDefault();
										setVariant(v as ThemeVariant);
									}
								}}
								sx={{
									width: 44,
									height: 44,
									borderRadius: 1.5,
									cursor: 'pointer',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									color: 'text.secondary',
									background: isCustom
										? 'transparent'
										: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`,
									border: 2,
									borderStyle: isCustom ? 'dashed' : 'solid',
									borderColor: selected ? 'primary.main' : 'divider',
									boxShadow: selected ? 3 : 0,
									transition: 'all 0.15s ease',
									'&:hover': { borderColor: 'primary.main' },
								}}
							>
								{isCustom && <AddRoundedIcon fontSize="small" />}
							</Box>
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
							<ColorField
								key={key}
								label={t(`colors.${key}`)}
								placeholder={t('hexPlaceholder')}
								invalidLabel={t('hexInvalid')}
								pickLabel={t('pickColor', { label: t(`colors.${key}`) })}
								value={draft.customTokens[key]}
								onColor={(hex) => setColor(key, hex)}
							/>
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
						min={APP_FONT_MIN}
						max={APP_FONT_MAX}
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
				<Button variant="contained" disabled={isSaving} onClick={handleSave}>
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
	min = 8,
	max = 32,
}: {
	label: string;
	sizeLabel: string;
	fonts: string[];
	font: string;
	size: number;
	onFont: (v: string) => void;
	onSize: (v: number) => void;
	min?: number;
	max?: number;
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
				slotProps={{ htmlInput: { min, max } }}
			/>
		</Box>
	);
}

function ColorField({
	label,
	placeholder,
	invalidLabel,
	pickLabel,
	value,
	onColor,
}: {
	label: string;
	placeholder: string;
	invalidLabel: string;
	pickLabel: string;
	value: string;
	onColor: (hex: string) => void;
}) {
	const [text, setText] = useState(value);
	const [lastValue, setLastValue] = useState(value);
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

	// Re-sync when the stored value changes from the outside (e.g. prefs reload),
	// but keep the raw text the user is currently typing if it already resolves
	// to the stored value (avoids clobbering mid-edit, e.g. lowercase input).
	if (value !== lastValue) {
		setLastValue(value);
		if (normalizeHexInput(text) !== value) setText(value);
	}

	const normalized = normalizeHexInput(text);
	const invalid = text.trim() !== '' && normalized === null;
	const swatch = normalized ?? value;

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
			<Typography variant="caption" color="text.secondary" noWrap>
				{label}
			</Typography>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
				<Box
					role="button"
					tabIndex={0}
					aria-label={pickLabel}
					aria-haspopup="dialog"
					onClick={(e) => setAnchorEl(e.currentTarget)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							if (e.key === ' ') e.preventDefault();
							setAnchorEl(e.currentTarget);
						}
					}}
					sx={{
						width: 28,
						height: 28,
						flexShrink: 0,
						border: 1,
						borderColor: 'divider',
						borderRadius: 1,
						bgcolor: swatch,
						cursor: 'pointer',
						transition: 'border-color 0.15s ease',
						'&:hover, &:focus-visible': { borderColor: 'primary.main' },
					}}
				/>
				<ColorPickerPopover
					anchorEl={anchorEl}
					value={swatch}
					onChange={(hex) => {
						setText(hex);
						onColor(hex);
					}}
					onClose={() => setAnchorEl(null)}
				/>
				<TextField
					size="small"
					fullWidth
					placeholder={placeholder}
					aria-label={label}
					error={invalid}
					helperText={invalid ? invalidLabel : undefined}
					value={text}
					onChange={(e) => {
						setText(e.target.value);
						const next = normalizeHexInput(e.target.value);
						if (next) onColor(next);
					}}
					onBlur={() => setText(value)}
				/>
			</Box>
		</Box>
	);
}
