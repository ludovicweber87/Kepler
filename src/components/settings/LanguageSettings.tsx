'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { alpha } from '@mui/material/styles';
import { setLocale } from '@/lib/locale';
import type { Locale } from '@/i18n/request';

const LOCALES: { code: Locale; flag: string; label: string }[] = [
	{ code: 'en', flag: '🇬🇧', label: 'English' },
	{ code: 'fr', flag: '🇫🇷', label: 'Français' },
	{ code: 'es', flag: '🇪🇸', label: 'Español' },
	{ code: 'de', flag: '🇩🇪', label: 'Deutsch' },
	{ code: 'pt', flag: '🇧🇷', label: 'Português' },
];

export default function LanguageSettings() {
	const t = useTranslations('settings');
	const currentLocale = useLocale();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const handleChange = (locale: Locale) => {
		if (locale === currentLocale || isPending) return;
		startTransition(async () => {
			await setLocale(locale);
			router.refresh();
		});
	};

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
			<Typography variant="body2" color="text.secondary">
				{t('languageDesc')}
			</Typography>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
					gap: 1.5,
					opacity: isPending ? 0.6 : 1,
					transition: 'opacity 0.15s',
				}}
			>
				{LOCALES.map(({ code, flag, label }) => {
					const selected = code === currentLocale;
					return (
						<Box
							key={code}
							role="button"
							tabIndex={0}
							aria-pressed={selected}
							aria-label={label}
							onClick={() => handleChange(code)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									if (e.key === ' ') e.preventDefault();
									handleChange(code);
								}
							}}
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 1.5,
								px: 1.5,
								py: 1.25,
								borderRadius: 2,
								cursor: isPending ? 'default' : 'pointer',
								border: 2,
								borderColor: selected ? 'primary.main' : 'divider',
								bgcolor: (th) =>
									selected ? alpha(th.palette.primary.main, 0.08) : 'transparent',
								transition: 'all 0.15s ease',
								'&:hover': { borderColor: 'primary.main' },
							}}
						>
							<Box component="span" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
								{flag}
							</Box>
							<Typography variant="body2" sx={{ fontWeight: 500 }}>
								{label}
							</Typography>
							{selected &&
								(isPending ? (
									<CircularProgress size={14} sx={{ ml: 'auto' }} />
								) : (
									<CheckRoundedIcon
										sx={{ fontSize: 16, ml: 'auto', color: 'primary.main' }}
									/>
								))}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}
