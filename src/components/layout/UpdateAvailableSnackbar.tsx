'use client';

import { useCallback, useState } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Slide, { type SlideProps } from '@mui/material/Slide';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import SystemUpdateAltRoundedIcon from '@mui/icons-material/SystemUpdateAltRounded';
import { useKeplerUpdate } from '@/hooks/useKeplerUpdate';
import { useSnackbar } from '@/hooks/useSnackbar';
import { readStoredItem } from '@/lib/storage';
import { shouldShowUpdate, UPDATE_COMMAND, UPDATE_DISMISSED_KEY } from '@/lib/keplerUpdate';
import { appShadow } from '@/theme/shadows';

function SlideLeft(props: SlideProps) {
	return <Slide {...props} direction="left" />;
}

/**
 * Bannière persistante réclamant un `kepler update` quand le checkout est en
 * retard sur origin/main.
 *
 * Pas d'auto-hide, contrairement au snackbar générique : une mise à jour qu'on
 * n'a pas eu le temps de lire est une mise à jour jamais faite. Ancrée en bas à
 * droite pour ne pas se superposer au snackbar générique (bas centre).
 */
export default function UpdateAvailableSnackbar() {
	const t = useTranslations('update');
	const { showSnackbar } = useSnackbar();
	const status = useKeplerUpdate();
	const [dismissedSha, setDismissedSha] = useState<string | null>(() =>
		readStoredItem(UPDATE_DISMISSED_KEY),
	);

	const dismiss = useCallback(() => {
		const sha = status?.remoteSha;
		if (!sha) return;
		setDismissedSha(sha);
		try {
			window.localStorage.setItem(UPDATE_DISMISSED_KEY, sha);
		} catch {
			// Navigation privée : le rejet ne survivra pas au reload, tant pis.
		}
	}, [status?.remoteSha]);

	const copyCommand = useCallback(() => {
		navigator.clipboard
			.writeText(UPDATE_COMMAND)
			.then(() => showSnackbar(t('commandCopied')))
			.catch(() => showSnackbar(t('copyFailed'), 'error'));
	}, [showSnackbar, t]);

	if (!shouldShowUpdate(status, dismissedSha)) return null;

	return (
		<Snackbar
			open
			anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
			TransitionComponent={SlideLeft}
			sx={{ mb: 2, mr: 2 }}
		>
			<Alert
				icon={<SystemUpdateAltRoundedIcon fontSize="small" />}
				severity="info"
				variant="outlined"
				onClose={dismiss}
				sx={(theme) => ({
					minWidth: 320,
					maxWidth: 420,
					px: 2,
					py: 1.25,
					alignItems: 'flex-start',
					color: theme.palette.text.primary,
					bgcolor: alpha(theme.palette.background.paper, 0.82),
					backdropFilter: 'blur(12px)',
					WebkitBackdropFilter: 'blur(12px)',
					border: `1px solid ${theme.palette.divider}`,
					borderLeft: `3px solid ${theme.palette.info.main}`,
					borderRadius: '14px',
					boxShadow: appShadow(theme.palette.mode),
					'& .MuiAlert-icon': { color: theme.palette.info.main, pt: 0.25 },
					'& .MuiAlert-action': { pt: 0, color: theme.palette.text.secondary },
				})}
			>
				<AlertTitle sx={{ fontWeight: 700, fontSize: '0.82rem', mb: 0.25 }}>
					{t('available')}
				</AlertTitle>
				<Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
					{t('behind', { count: status!.behind })}
				</Typography>
				<Box
					component="code"
					sx={{
						display: 'block',
						mt: 0.75,
						px: 0.75,
						py: 0.5,
						fontSize: '0.72rem',
						fontFamily: 'monospace',
						borderRadius: 1,
						bgcolor: (theme) => alpha(theme.palette.text.primary, 0.06),
						color: 'text.primary',
					}}
				>
					{UPDATE_COMMAND}
				</Box>
				<Button
					size="small"
					onClick={copyCommand}
					sx={{ mt: 0.75, px: 0, minWidth: 0, fontSize: '0.72rem', fontWeight: 700 }}
				>
					{t('copyCommand')}
				</Button>
			</Alert>
		</Snackbar>
	);
}
