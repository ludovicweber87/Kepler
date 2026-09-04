import type { KeplerUpdateStatus } from '@/types';

/** SHA distant déjà écarté par l'utilisateur — la bannière ne doit plus le rappeler. */
export const UPDATE_DISMISSED_KEY = 'kepler-update-dismissed-sha';

/** Commande à lancer pour appliquer la mise à jour (update seul ne suffit pas : il faut relancer). */
export const UPDATE_COMMAND = 'kepler update && kepler restart';

/**
 * Faut-il afficher la bannière de mise à jour ?
 *
 * Le rejet est mémorisé par SHA distant, pas globalement : écarter la bannière
 * une fois ne doit pas masquer *les* mises à jour suivantes, seulement celle-là.
 * Fonction pure.
 */
export function shouldShowUpdate(
	status: KeplerUpdateStatus | null | undefined,
	dismissedSha: string | null,
): boolean {
	if (!status?.updateAvailable) return false;
	if (!status.remoteSha) return false;
	return status.remoteSha !== dismissedSha;
}
