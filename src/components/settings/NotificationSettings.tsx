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
		// eslint-disable-next-line react-hooks/set-state-in-effect -- hydratation unique post-SSR (localStorage/Notification.permission), pas une boucle de sync
		setOsEnabled(isOsNotificationsEnabled());
		setSoundOn(!isNotificationSoundMuted());
		setPermission('Notification' in window ? Notification.permission : 'unsupported');
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
			const result = await Notification.requestPermission();
			setPermission(result);
			granted = result === 'granted';
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
