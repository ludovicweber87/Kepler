/**
 * Lit une clé `localStorage` sans lever côté serveur ni en navigation privée.
 *
 * Appelée depuis des `getSnapshot()` de `useSyncExternalStore`, qui doivent
 * rester purs et rendre une valeur stable — d'où la lecture seule.
 */
export function readStoredItem(key: string): string | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}
