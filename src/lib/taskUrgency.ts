import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { UrgencyLevel } from '@/types';

export interface UrgencyResult {
	level: UrgencyLevel;
	/** Nombre de jours calendaires jusqu'à l'échéance (0 = aujourd'hui, négatif = en retard). null si pas de date. */
	daysRemaining: number | null;
}

/**
 * Calcule le niveau d'urgence d'une task à partir de son échéance.
 * Logique dérivée (jamais stockée) — bornes en jours calendaires :
 *   pas de date      → none
 *   > 3 j            → green
 *   2 à 3 j          → orange
 *   0 à 1 j          → red
 *   dépassée (< 0)   → overdue
 */
export function computeUrgency(dueDate: string | null | undefined, now: Date): UrgencyResult {
	if (!dueDate) return { level: 'none', daysRemaining: null };

	const daysRemaining = differenceInCalendarDays(parseISO(dueDate), now);

	let level: UrgencyLevel;
	if (daysRemaining < 0) level = 'overdue';
	else if (daysRemaining <= 1) level = 'red';
	else if (daysRemaining <= 3) level = 'orange';
	else level = 'green';

	return { level, daysRemaining };
}
