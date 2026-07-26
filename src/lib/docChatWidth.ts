/** Largeur du panneau de chat d'une doc — logique pure, persistée en app_settings. */

export const DOC_CHAT_WIDTH_MIN = 320;
export const DOC_CHAT_WIDTH_MAX = 720;
export const DOC_CHAT_WIDTH_DEFAULT = 420;

export function clampDocChatWidth(px: number): number {
	return Math.min(DOC_CHAT_WIDTH_MAX, Math.max(DOC_CHAT_WIDTH_MIN, Math.round(px)));
}

export function parseDocChatWidth(raw: string | null | undefined): number {
	if (!raw) return DOC_CHAT_WIDTH_DEFAULT;
	const n = Number(raw);
	if (!Number.isFinite(n)) return DOC_CHAT_WIDTH_DEFAULT;
	return clampDocChatWidth(n);
}
