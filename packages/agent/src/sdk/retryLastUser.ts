import type { StreamEvent } from './types.js';

/**
 * Décide s'il faut relancer le dernier prompt user à la reprise d'une session.
 *
 * Vrai uniquement si le tout dernier event du transcript est un message `user`
 * porteur de texte : c'est la signature d'un run interrompu avant toute réponse
 * de l'agent (dès que l'agent a produit un event, le dernier n'est plus `user`).
 *
 * Renvoie le texte à re-pousser dans la queue SDK, ou `null` si aucune reprise
 * n'est nécessaire (dernier event ≠ user, ou message user sans texte).
 */
export function extractLastUserText(
	transcript: { seq: number; event: StreamEvent }[],
): string | null {
	const last = transcript[transcript.length - 1]?.event;
	if (!last || last.event !== 'user') return null;
	const text = typeof last.data.text === 'string' ? last.data.text.trim() : '';
	return text.length > 0 ? text : null;
}
