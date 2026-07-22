import type { DailyRecap } from '@/types';

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

/**
 * Agrège les points de tous les recaps par jour (`recap_date`). Chaque jour
 * ayant au moins un recap est présent dans la map (tableau éventuellement vide
 * si le contenu ne produit aucun point) ; les points parsés (`parseRecapPoints`)
 * sont concaténés dans l'ordre du tableau fourni. Fonction pure → testable.
 */
export function aggregatePointsByDay(recaps: DailyRecap[]): Map<string, string[]> {
	const byDay = new Map<string, string[]>();

	for (const recap of recaps) {
		const existing = byDay.get(recap.recap_date) ?? [];
		existing.push(...parseRecapPoints(recap.content));
		byDay.set(recap.recap_date, existing);
	}

	return byDay;
}
