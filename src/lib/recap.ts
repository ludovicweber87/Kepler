/**
 * Découpe le markdown d'un recap (`content`, "puces courtes") en une liste de
 * points. Chaque ligne non vide devient un point ; les marqueurs de puce
 * (`-`/`*`/`+`), de liste numérotée (`1.`) et de titre (`#`) sont retirés.
 * Fonction pure → testable sans DOM.
 */
export function parseRecapPoints(content: string): string[] {
	if (!content) return [];

	const points = content
		.split('\n')
		.map((line) => line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+)?/, '').trim())
		.filter((line) => line.length > 0);

	if (points.length > 0) return points;

	const trimmed = content.trim();
	return trimmed ? [trimmed] : [];
}

/**
 * Tronque un texte à `max` caractères, en ajoutant une ellipsis si dépassement.
 */
export function truncateTitle(text: string, max = 100): string {
	if (text.length <= max) return text;
	return text.slice(0, max).trimEnd() + '…';
}
