import { describe, it, expect } from 'vitest';
import { computeUrgency } from './taskUrgency';

// Référence stable : 2026-07-23 à midi (évite les effets de bord de fuseau/heure).
const NOW = new Date('2026-07-23T12:00:00');

describe('computeUrgency', () => {
	it('renvoie none sans date', () => {
		expect(computeUrgency(null, NOW)).toEqual({ level: 'none', daysRemaining: null });
		expect(computeUrgency(undefined, NOW)).toEqual({ level: 'none', daysRemaining: null });
	});

	it('vert au-delà de 3 jours', () => {
		expect(computeUrgency('2026-07-27', NOW)).toEqual({ level: 'green', daysRemaining: 4 });
		expect(computeUrgency('2026-08-15', NOW).level).toBe('green');
	});

	it('orange sur la borne 2–3 jours', () => {
		expect(computeUrgency('2026-07-26', NOW)).toEqual({ level: 'orange', daysRemaining: 3 });
		expect(computeUrgency('2026-07-25', NOW)).toEqual({ level: 'orange', daysRemaining: 2 });
	});

	it('rouge sur la borne 0–1 jour (aujourd’hui et demain)', () => {
		expect(computeUrgency('2026-07-24', NOW)).toEqual({ level: 'red', daysRemaining: 1 });
		expect(computeUrgency('2026-07-23', NOW)).toEqual({ level: 'red', daysRemaining: 0 });
	});

	it('overdue quand la date est dépassée', () => {
		expect(computeUrgency('2026-07-22', NOW)).toEqual({ level: 'overdue', daysRemaining: -1 });
		expect(computeUrgency('2026-07-01', NOW).level).toBe('overdue');
	});

	it('compte en jours calendaires, pas en heures (fin de journée)', () => {
		// Échéance aujourd'hui, mais on est en fin de journée → toujours 0 jour restant.
		const lateToday = new Date('2026-07-23T23:30:00');
		expect(computeUrgency('2026-07-24', lateToday)).toEqual({ level: 'red', daysRemaining: 1 });
	});
});
