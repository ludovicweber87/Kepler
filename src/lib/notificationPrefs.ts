const OS_ENABLED_KEY = 'devora.notif.os';

/** True si les notifications système sont activées (persisté en localStorage). SSR-safe. */
export function isOsNotificationsEnabled(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage.getItem(OS_ENABLED_KEY) === '1';
	} catch {
		return false;
	}
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
