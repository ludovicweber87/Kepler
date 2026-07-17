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
import { useTranslations } from 'next-intl';
import { useColorMode } from '@/hooks/useColorMode';
import { useThemePrefs } from '@/hooks/useThemePrefs';
import { useSnackbar } from '@/hooks/useSnackbar';
import { THEME_VARIANTS, THEME_VARIANT_SWATCH, type ThemeVariant } from '@/theme/theme';
import { APP_FONTS, TERMINAL_FONTS, COLOR_TOKEN_KEYS, type ThemePrefs } from '@/lib/themePrefs';

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
									background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`,
									border: 2,
									borderColor: selected ? 'primary.main' : 'divider',
									boxShadow: selected ? 3 : 0,
									transition: 'all 0.15s ease',
								}}
							/>
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
							<Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<Box
									component="input"
									type="color"
									value={draft.customTokens[key]}
									aria-label={t(`colors.${key}`)}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
										setColor(key, e.target.value)
									}
									sx={{
										width: 28,
										height: 28,
										p: 0,
										border: 1,
										borderColor: 'divider',
										borderRadius: 1,
										bgcolor: 'transparent',
										cursor: 'pointer',
										flexShrink: 0,
										'&::-webkit-color-swatch-wrapper': { p: 0 },
										'&::-webkit-color-swatch': {
											border: 'none',
											borderRadius: 3,
										},
									}}
								/>
								<Typography variant="caption" color="text.secondary" noWrap>
									{t(`colors.${key}`)}
								</Typography>
							</Box>
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
}: {
	label: string;
	sizeLabel: string;
	fonts: string[];
	font: string;
	size: number;
	onFont: (v: string) => void;
	onSize: (v: number) => void;
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
				slotProps={{ htmlInput: { min: 8, max: 32 } }}
			/>
		</Box>
	);
}
