/** Largeur du panneau de chat d'une doc — logique pure, persistée en app_settings. */

export const DOC_CHAT_WIDTH_MIN = 320;
export const DOC_CHAT_WIDTH_MAX = 720;
export const DOC_CHAT_WIDTH_DEFAULT = 420;

/** Clamp une largeur en px dans [320, 720]. NaN → défaut (cf. clampSplitPct). */
export function clampDocChatWidth(px: number): number {
	// Appelé directement par le handler de drag : sans ce garde, un NaN issu d'un
	// calcul de pointeur partirait tel quel dans une largeur CSS.
	if (!Number.isFinite(px)) return DOC_CHAT_WIDTH_DEFAULT;
	return Math.min(DOC_CHAT_WIDTH_MAX, Math.max(DOC_CHAT_WIDTH_MIN, Math.round(px)));
}

/** Parse une valeur DB (string) en largeur clampée, avec fallback sur le défaut. */
export function parseDocChatWidth(raw: string | null | undefined): number {
	if (!raw) return DOC_CHAT_WIDTH_DEFAULT;
	const n = Number(raw);
	if (!Number.isFinite(n)) return DOC_CHAT_WIDTH_DEFAULT;
	return clampDocChatWidth(n);
}
