'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { alpha } from '@mui/material/styles';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useTranslations } from 'next-intl';
import { setLocale } from '@/lib/locale';
import type { Locale } from '@/i18n/request';

const LOCALES: { code: Locale; flag: string; label: string }[] = [
	{ code: 'en', flag: '🇬🇧', label: 'English' },
	{ code: 'fr', flag: '🇫🇷', label: 'Français' },
	{ code: 'es', flag: '🇪🇸', label: 'Español' },
	{ code: 'de', flag: '🇩🇪', label: 'Deutsch' },
	{ code: 'pt', flag: '🇧🇷', label: 'Português' },
];

export default function LocaleSwitcher() {
	const currentLocale = useLocale();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const tc = useTranslations('common');

	const handleChange = (locale: Locale) => {
		setAnchorEl(null);
		if (locale === currentLocale) return;
		startTransition(async () => {
			await setLocale(locale);
			router.refresh();
		});
	};

	return (
		<>
			<ListItemButton
				onClick={(e) => setAnchorEl(e.currentTarget)}
				disabled={isPending}
				sx={{
					borderRadius: 1,
					mb: 0.5,
					px: 2,
					py: 1,
					opacity: isPending ? 0.5 : 1,
					transition: 'background-color 0.15s, transform 0.15s',
					'&:hover': {
						bgcolor: alpha('#7C5CFF', 0.1),
						transform: 'translateX(4px)',
					},
				}}
			>
				<ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
					<TranslateRoundedIcon />
				</ListItemIcon>
				<ListItemText
					primary={tc('language')}
					primaryTypographyProps={{
						fontSize: '0.85rem',
						fontWeight: 500,
					}}
				/>
			</ListItemButton>
			<Menu
				anchorEl={anchorEl}
				open={!!anchorEl}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
				transformOrigin={{ vertical: 'center', horizontal: 'left' }}
				slotProps={{
					paper: {
						sx: {
							bgcolor: 'background.paper',
							border: 1,
							borderColor: 'divider',
							ml: 1,
							minWidth: 160,
						},
					},
				}}
			>
				{LOCALES.map(({ code, flag, label }) => (
					<MenuItem
						key={code}
						onClick={() => handleChange(code)}
						selected={currentLocale === code}
						sx={{
							gap: 1.5,
							fontSize: '0.85rem',
							'&.Mui-selected': {
								bgcolor: alpha('#7C5CFF', 0.08),
							},
							'&:hover': { bgcolor: alpha('#7C5CFF', 0.12) },
						}}
					>
						<span>{flag}</span>
						{label}
						{currentLocale === code && (
							<CheckRoundedIcon sx={{ fontSize: 16, ml: 'auto', color: '#7C5CFF' }} />
						)}
					</MenuItem>
				))}
			</Menu>
		</>
	);
}
