import {
	startOfMonth,
	endOfMonth,
	startOfWeek,
	endOfWeek,
	eachDayOfInterval,
	addMonths,
	format,
	parse,
} from 'date-fns';

export interface MonthGridDay {
	date: Date;
	key: string; // yyyy-MM-dd (local)
	inMonth: boolean; // false pour les jours de remplissage (mois précédent/suivant)
}

/** Parse une chaîne `yyyy-MM` vers le 1er jour du mois (heure locale). */
export function parseMonth(month: string): Date {
	return parse(`${month}-01`, 'yyyy-MM-dd', new Date());
}

/** Formatte une Date en clé `yyyy-MM-dd` (locale, stable pour comparaison). */
export function toKey(date: Date): string {
	return format(date, 'yyyy-MM-dd');
}

/** Mois adjacent au format `yyyy-MM`. */
export function shiftMonth(month: string, delta: number): string {
	return format(addMonths(parseMonth(month), delta), 'yyyy-MM');
}

/**
 * Construit la grille d'un mois : des semaines complètes (7 jours), incluant
 * les jours de remplissage des mois adjacents pour aligner sur les colonnes.
 * `weekStartsOn` : 1 = lundi (défaut, France).
 */
export function buildMonthGrid(month: string, weekStartsOn: 0 | 1 = 1): MonthGridDay[][] {
	const monthStart = startOfMonth(parseMonth(month));
	const monthEnd = endOfMonth(monthStart);
	const gridStart = startOfWeek(monthStart, { weekStartsOn });
	const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
	const monthNum = monthStart.getMonth();

	const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => ({
		date,
		key: toKey(date),
		inMonth: date.getMonth() === monthNum,
	}));

	const weeks: MonthGridDay[][] = [];
	for (let i = 0; i < days.length; i += 7) {
		weeks.push(days.slice(i, i + 7));
	}
	return weeks;
}
