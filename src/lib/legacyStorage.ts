/**
 * Lit une clé `localStorage` en retombant sur son ancien nom, hérité du temps où
 * le projet s'appelait Devora. Le profil Electron déjà installé porte les clés
 * `devora-*` / `devora.*` : sans ce fallback, le renommage réinitialiserait
 * silencieusement le thème, l'état de la sidebar, les brouillons du composer et
 * les préférences de notification.
 *
 * Lecture seule et sans effet de bord : la fonction est appelée depuis des
 * `getSnapshot()` de `useSyncExternalStore`, qui doivent rester pures et rendre
 * une valeur stable. L'ancienne clé s'efface d'elle-même dès la première
 * écriture, qui se fait toujours sous le nouveau nom.
 */
export function readStoredItem(key: string, legacyKey: string): string | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey);
	} catch {
		return null;
	}
}
