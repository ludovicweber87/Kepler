import { readStoredItem } from '@/lib/storage';

const OS_ENABLED_KEY = 'kepler.notif.os';

/** True si les notifications système sont activées (persisté en localStorage). SSR-safe. */
export function isOsNotificationsEnabled(): boolean {
	return readStoredItem(OS_ENABLED_KEY) === '1';
}

/** Persiste l'activation des notifications système. SSR-safe. */
export function setOsNotificationsEnabled(enabled: boolean): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(OS_ENABLED_KEY, enabled ? '1' : '0');
	} catch {
		// localStorage indisponible (mode privé strict) — on ignore.
	}
}
