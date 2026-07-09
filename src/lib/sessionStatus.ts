/**
 * Source de vérité unique du cycle de vie d'une session agent, dérivée de la DB.
 *
 *   Créer            → active
 *   Arrêter (manuel) → past
 *   Reprendre        → active
 *   Archiver         → archived (page dédiée, non reprenable)
 *
 * `status === 'active'` ⇒ actif. Tout autre statut (completed/error) ⇒ passé.
 * `archived_at` non null ⇒ archivé (prime sur le statut).
 */
export type SessionBucket = 'active' | 'past' | 'archived';

export interface ClassifiableSession {
	status?: string | null;
	archived_at?: string | null;
}

export function classifySession(s: ClassifiableSession): SessionBucket {
	if (s.archived_at) return 'archived';
	return s.status === 'active' ? 'active' : 'past';
}

export const isActive = (s: ClassifiableSession) => classifySession(s) === 'active';
export const isPast = (s: ClassifiableSession) => classifySession(s) === 'past';
export const isArchived = (s: ClassifiableSession) => classifySession(s) === 'archived';
