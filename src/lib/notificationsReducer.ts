import type { AppNotification, NotificationSource } from '@/types';

export function prependNotification(list: AppNotification[], incoming: AppNotification, cap = 200): AppNotification[] {
	const filtered = list.filter(n => n.id !== incoming.id);
	return [incoming, ...filtered].slice(0, cap);
}

export function unreadCount(list: AppNotification[]): number {
	return list.reduce((acc, n) => acc + (n.read_at ? 0 : 1), 0);
}

export function titleFor(n: AppNotification, t: (key: string, vars?: Record<string, string>) => string): string {
	const translated = t(n.type, n.payload);
	if (translated && translated !== n.type) return translated;
	return n.title || n.type;
}

export function iconKeyFor(source: NotificationSource): string {
	return source; // mappé en composant côté UI
}

export function groupByDay(list: AppNotification[]): Array<{ day: string; items: AppNotification[] }> {
	const groups = new Map<string, AppNotification[]>();
	for (const n of list) {
		const day = (n.created_at ?? '').slice(0, 10);
		if (!groups.has(day)) groups.set(day, []);
		groups.get(day)!.push(n);
	}
	return [...groups.entries()]
		.sort((a, b) => (a[0] < b[0] ? 1 : -1))
		.map(([day, items]) => ({ day, items }));
}
