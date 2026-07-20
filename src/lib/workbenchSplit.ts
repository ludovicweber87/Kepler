export const SPLIT_MIN = 40;
export const SPLIT_MAX = 80;
export const SPLIT_DEFAULT = 68;

/** Clamp un pourcentage de largeur gauche dans [40, 80]. */
export function clampSplitPct(pct: number): number {
	if (Number.isNaN(pct)) return SPLIT_DEFAULT;
	return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
}

/** Parse une valeur DB (string) en pourcentage clampé, avec fallback. */
export function parseSplitPct(
	raw: string | null | undefined,
	fallback: number = SPLIT_DEFAULT,
): number {
	const n = raw == null ? Number.NaN : Number.parseFloat(raw);
	if (Number.isNaN(n)) return fallback;
	return clampSplitPct(n);
}
