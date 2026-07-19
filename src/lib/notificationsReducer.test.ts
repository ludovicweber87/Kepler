import { describe, it, expect } from 'vitest';
import {
	prependNotification,
	titleFor,
	unreadCount,
	groupByDay,
	dbTimestampToDate,
	unreadAgentIdsBySession,
} from './notificationsReducer';
import type { AppNotification } from '@/types';

const mk = (over: Partial<AppNotification> = {}): AppNotification => ({
	id: 'a',
	source: 'agent',
	type: 'agent_done',
	priority: 'normal',
	title: '',
	body: '',
	url: '/w',
	entity_ref: null,
	payload: {},
	read_at: null,
	created_at: '2026-07-18 10:00:00',
	...over,
});

describe('prependNotification', () => {
	it('adds to front and dedups by id', () => {
		const list = [mk({ id: '1' })];
		const out = prependNotification(list, mk({ id: '2' }));
		expect(out.map((n) => n.id)).toEqual(['2', '1']);
		const dup = prependNotification(out, mk({ id: '2' }));
		expect(dup.map((n) => n.id)).toEqual(['2', '1']);
	});
	it('caps the list length', () => {
		const list = Array.from({ length: 5 }, (_, i) => mk({ id: String(i) }));
		expect(prependNotification(list, mk({ id: 'x' }), 3)).toHaveLength(3);
	});
});

describe('unreadCount', () => {
	it('counts null read_at', () => {
		expect(unreadCount([mk({ read_at: null }), mk({ id: 'b', read_at: '2026-07-18' })])).toBe(
			1,
		);
	});
});

describe('titleFor', () => {
	it('uses t(type, payload) and falls back to n.title', () => {
		const t = (k: string, v?: Record<string, string>) => `${k}:${v?.repo ?? ''}`;
		expect(titleFor(mk({ type: 'ci_failed', payload: { repo: 'o/r' } }), t)).toBe(
			'ci_failed:o/r',
		);
	});
	it('forwards title/repo/number to the template', () => {
		const t = (_k: string, v?: Record<string, string>) => `${v?.title}|${v?.repo}|${v?.number}`;
		expect(
			titleFor(
				mk({
					type: 'pr_merged',
					payload: { repo: 'o/r', number: '42', title: 'Fix login redirect' },
				}),
				t,
			),
		).toBe('Fix login redirect|o/r|42');
	});
	it('defaults missing placeholders to empty (no throw on absent number)', () => {
		const t = (_k: string, v?: Record<string, string>) => `${v?.title}#${v?.number}`;
		expect(titleFor(mk({ type: 'mention', payload: { repo: 'o/r', title: 'Hi' } }), t)).toBe(
			'Hi#',
		);
	});
});

describe('groupByDay', () => {
	it('groups by calendar day, newest first', () => {
		const g = groupByDay([
			mk({ id: '1', created_at: '2026-07-18 09:00:00' }),
			mk({ id: '2', created_at: '2026-07-17 09:00:00' }),
		]);
		expect(g.map((x) => x.day)).toEqual(['2026-07-18', '2026-07-17']);
	});
});

describe('unreadAgentIdsBySession', () => {
	it('groups unread agent notif ids by session via entity_ref', () => {
		const m = unreadAgentIdsBySession([
			mk({ id: '1', entity_ref: { kind: 'session', id: 's1' } }),
			mk({ id: '2', entity_ref: { kind: 'session', id: 's1' } }),
			mk({ id: '3', entity_ref: { kind: 'session', id: 's2' } }),
		]);
		expect(m.get('s1')).toEqual(['1', '2']);
		expect(m.get('s2')).toEqual(['3']);
	});
	it('falls back to payload.session when no entity_ref', () => {
		const m = unreadAgentIdsBySession([
			mk({ id: '1', entity_ref: null, payload: { session: 's9' } }),
		]);
		expect(m.get('s9')).toEqual(['1']);
	});
	it('ignores read, non-agent and session-less notifications', () => {
		const m = unreadAgentIdsBySession([
			mk({ id: '1', read_at: '2026-07-18', entity_ref: { kind: 'session', id: 's1' } }),
			mk({ id: '2', source: 'pr', entity_ref: { kind: 'pr', id: '42', repo: 'o/r' } }),
			mk({ id: '3', entity_ref: null, payload: {} }),
		]);
		expect(m.size).toBe(0);
	});
});

describe('dbTimestampToDate', () => {
	it('parses a naive SQLite timestamp (space, no tz) as UTC', () => {
		expect(dbTimestampToDate('2026-07-18 10:00:00').getTime()).toBe(
			Date.UTC(2026, 6, 18, 10, 0, 0),
		);
	});
	it('leaves an ISO string with Z intact', () => {
		expect(dbTimestampToDate('2026-07-18T10:00:00Z').getTime()).toBe(
			Date.UTC(2026, 6, 18, 10, 0, 0),
		);
	});
	it('returns an invalid Date for empty/nullish input', () => {
		expect(Number.isNaN(dbTimestampToDate('').getTime())).toBe(true);
		expect(Number.isNaN(dbTimestampToDate(null).getTime())).toBe(true);
	});
});
