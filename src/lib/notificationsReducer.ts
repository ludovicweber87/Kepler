import type { AppNotification, NotificationSource } from '@/types';

export function prependNotification(
	list: AppNotification[],
	incoming: AppNotification,
	cap = 200,
): AppNotification[] {
	const filtered = list.filter((n) => n.id !== incoming.id);
	return [incoming, ...filtered].slice(0, cap);
}

export function unreadCount(list: AppNotification[]): number {
	return list.reduce((acc, n) => acc + (n.read_at ? 0 : 1), 0);
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

export function iconKeyFor(source: NotificationSource): string {
	return source; // mappé en composant côté UI
}

/**
 * Convertit un timestamp SQLite (`datetime('now')` → "YYYY-MM-DD HH:MM:SS", UTC
 * sans suffixe de fuseau) en `Date`. Sans normalisation, `new Date()` interprète
 * cette chaîne (espace + pas de `Z`) comme de l'heure locale en V8 → décalage de
 * l'offset UTC. On force donc l'interprétation UTC. Laisse les chaînes déjà ISO
 * (avec `T`/`Z`) intactes.
 */
export function dbTimestampToDate(s: string | null | undefined): Date {
	if (!s) return new Date(NaN);
	const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
	return new Date(iso);
}

/** Clé de jour locale (YYYY-MM-DD) d'une Date ; chaîne vide si invalide. */
function localDayKey(d: Date): string {
	if (Number.isNaN(d.getTime())) return '';
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function groupByDay(
	list: AppNotification[],
): Array<{ day: string; items: AppNotification[] }> {
	const groups = new Map<string, AppNotification[]>();
	for (const n of list) {
		const day = localDayKey(dbTimestampToDate(n.created_at));
		if (!groups.has(day)) groups.set(day, []);
		groups.get(day)!.push(n);
	}
	return [...groups.entries()]
		.sort((a, b) => (a[0] < b[0] ? 1 : -1))
		.map(([day, items]) => ({ day, items }));
}
