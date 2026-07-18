'use client';

import { useCallback, useState } from 'react';
import { isNotificationSoundMuted, setNotificationSoundMuted } from '@/lib/notificationSound';

/** État réactif du mute son de notification, adossé à localStorage. Pour l'UI du toggle. */
export function useNotificationSoundMuted(): { muted: boolean; toggle: () => void } {
	const [muted, setMuted] = useState<boolean>(isNotificationSoundMuted);

	const toggle = useCallback(() => {
		setMuted((prev) => {
			const next = !prev;
			setNotificationSoundMuted(next);
			return next;
		});
	}, []);

	return { muted, toggle };
}
