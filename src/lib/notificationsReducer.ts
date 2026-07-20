import type { AppNotification } from '@/types';

export function prependNotification(
	list: AppNotification[],
	incoming: AppNotification,
	cap = 200,
): AppNotification[] {
	const filtered = list.filter((n) => n.id !== incoming.id);
	return [incoming, ...filtered].slice(0, cap);
}

/**
 * Regroupe les ids des notifications d'agent non lues par `session_id`.
 * La session est lue depuis `entity_ref.id` (quand `kind === 'session'`),
 * avec fallback sur `payload.session`. Utilisé pour afficher une pastille
 * sur le worktree correspondant dans la sidebar.
 */
export function unreadAgentIdsBySession(list: AppNotification[]): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const n of list) {
		if (n.source !== 'agent' || n.read_at) continue;
		const sessionId = n.entity_ref?.kind === 'session' ? n.entity_ref.id : n.payload?.session;
		if (!sessionId) continue;
		const ids = map.get(sessionId);
		if (ids) ids.push(n.id);
		else map.set(sessionId, [n.id]);
	}
	return map;
}

export function titleFor(
	n: AppNotification,
	t: (key: string, vars?: Record<string, string>) => string,
): string {
	// Défauts pour tout placeholder du template ({title}/{repo}/{number}) absent du
	// payload — next-intl throw si une variable du message n'a pas de valeur.
	const vars = { title: '', repo: '', number: '', ...n.payload };
	const translated = t(n.type, vars);
	if (translated && translated !== n.type) return translated;
	return n.title || n.type;
}
