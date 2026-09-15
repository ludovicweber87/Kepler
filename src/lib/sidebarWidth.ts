export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 480;
export const SIDEBAR_WIDTH_DEFAULT = 260;
export const SIDEBAR_WIDTH_COLLAPSED = 64;
/** Pas du redimensionnement au clavier (flèches sur la poignée). */
export const SIDEBAR_WIDTH_STEP = 16;

/**
 * Borne une largeur de sidebar dans [200, 480] px : sous 200px l'arbre PROJETS
 * devient illisible, au-delà de 480px la sidebar mange la zone de travail.
 */
export function clampSidebarWidth(px: number): number {
	if (!Number.isFinite(px)) return SIDEBAR_WIDTH_DEFAULT;
	return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(px)));
}

/** Parse une valeur persistée (string) en largeur clampée, avec fallback. */
export function parseSidebarWidth(raw: string | null | undefined): number {
	const n = raw == null ? Number.NaN : Number.parseFloat(raw);
	return clampSidebarWidth(n);
}
