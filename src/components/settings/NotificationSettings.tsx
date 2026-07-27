'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { isOsNotificationsEnabled, setOsNotificationsEnabled } from '@/lib/notificationPrefs';
import { isNotificationSoundMuted, setNotificationSoundMuted } from '@/lib/notificationSound';

type PermissionState = NotificationPermission | 'unsupported';

export default function NotificationSettings() {
	const t = useTranslations('settings.notifications');

	// localStorage et Notification.permission ne sont pas lisibles au premier
	// render (SSR) — on part d'un état sûr (switch OS désactivé) puis on
	// synchronise au montage.
	const [osEnabled, setOsEnabled] = useState(false);
	const [soundOn, setSoundOn] = useState(true);
	const [permission, setPermission] = useState<PermissionState>('unsupported');

	useEffect(() => {
		// hydratation unique post-SSR (localStorage/Notification.permission), pas une boucle de sync
		/* eslint-disable react-hooks/set-state-in-effect */
		const perm: PermissionState =
			'Notification' in window ? Notification.permission : 'unsupported';
		setPermission(perm);
		setSoundOn(!isNotificationSoundMuted());
		// La pref localStorage et la permission navigateur peuvent diverger (ex.
		// Chrome révoque silencieusement une permission inutilisée) : le switch ne
		// doit être considéré actif que si la permission est bien accordée, et on
		// nettoie la pref persistée pour qu'elle ne puisse pas ressusciter.
		const stored = isOsNotificationsEnabled();
		const effective = stored && perm === 'granted';
		setOsEnabled(effective);
		/* eslint-enable react-hooks/set-state-in-effect */
		if (stored && !effective) setOsNotificationsEnabled(false);
	}, []);

	// La permission ne peut être demandée que sur un geste utilisateur : une
	// demande spontanée au chargement se solde souvent par un refus définitif.
	const handleOsToggle = async (next: boolean) => {
		if (!next) {
			setOsNotificationsEnabled(false);
			setOsEnabled(false);
			return;
		}
		let granted = permission === 'granted';
		if (permission === 'default') {
			try {
				const result = await Notification.requestPermission();
				setPermission(result);
				granted = result === 'granted';
			} catch {
				// Contexte non sécurisé ou permission refusée par le navigateur —
				// on considère simplement que ce n'est pas accordé.
				granted = false;
			}
		}
		setOsNotificationsEnabled(granted);
		setOsEnabled(granted);
	};

	// La lib persiste un `muted` ; le switch s'affiche en positif.
	const handleSoundToggle = (next: boolean) => {
		setNotificationSoundMuted(!next);
		setSoundOn(next);
	};

	const osDisabled = permission === 'denied' || permission === 'unsupported';
	const osHelper =
		permission === 'denied'
			? t('osDenied')
			: permission === 'unsupported'
				? t('osUnsupported')
				: t('osDesc');

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
			<Box>
				<FormControlLabel
					control={
						<Switch
							size="small"
							checked={osEnabled}
							disabled={osDisabled}
							onChange={(e) => void handleOsToggle(e.target.checked)}
						/>
					}
					label={t('os')}
				/>
				<Typography variant="body2" color="text.secondary" sx={{ ml: 6 }}>
					{osHelper}
				</Typography>
			</Box>

			<Box>
				<FormControlLabel
					control={
						<Switch
							size="small"
							checked={soundOn}
							onChange={(e) => handleSoundToggle(e.target.checked)}
						/>
					}
					label={t('sound')}
				/>
				<Typography variant="body2" color="text.secondary" sx={{ ml: 6 }}>
					{t('soundDesc')}
				</Typography>
			</Box>
		</Box>
	);
}
