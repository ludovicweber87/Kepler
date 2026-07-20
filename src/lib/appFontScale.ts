export const APP_FONT_MIN = 10;
export const APP_FONT_MAX = 20;
export const APP_FONT_BASE = 12;
export const ROOT_FONT_PX = 16;

/** Clamp une taille de police app brute dans la plage supportée [10, 20] (px). */
export function clampAppFontSize(size: unknown): number {
	if (typeof size !== 'number' || Number.isNaN(size)) return APP_FONT_BASE;
	return Math.min(APP_FONT_MAX, Math.max(APP_FONT_MIN, Math.round(size)));
}

/** Facteur d'échelle relatif à la baseline de design (12px). */
export function appFontScale(size: unknown): number {
	return clampAppFontSize(size) / APP_FONT_BASE;
}

/** Font-size du <html> (px) qui pilote le scaling global des textes en rem. */
export function rootFontSizePx(size: unknown): number {
	return ROOT_FONT_PX * appFontScale(size);
}
