import { describe, it, expect } from 'vitest';
import { prependNotification, titleFor, unreadCount, groupByDay, dbTimestampToDate } from './notificationsReducer';
import type { AppNotification } from '@/types';

const mk = (over: Partial<AppNotification> = {}): AppNotification => ({
	id: 'a', source: 'agent', type: 'agent_done', priority: 'normal',
	title: '', body: '', url: '/w', entity_ref: null, payload: {}, read_at: null,
	created_at: '2026-07-18 10:00:00', ...over,
});

describe('prependNotification', () => {
	it('adds to front and dedups by id', () => {
		const list = [mk({ id: '1' })];
		const out = prependNotification(list, mk({ id: '2' }));
		expect(out.map(n => n.id)).toEqual(['2', '1']);
		const dup = prependNotification(out, mk({ id: '2' }));
		expect(dup.map(n => n.id)).toEqual(['2', '1']);
	});
	it('caps the list length', () => {
		const list = Array.from({ length: 5 }, (_, i) => mk({ id: String(i) }));
		expect(prependNotification(list, mk({ id: 'x' }), 3)).toHaveLength(3);
	});
});

describe('unreadCount', () => {
	it('counts null read_at', () => {
		expect(unreadCount([mk({ read_at: null }), mk({ id: 'b', read_at: '2026-07-18' })])).toBe(1);
	});
});

describe('titleFor', () => {
	it('uses t(type, payload) and falls back to n.title', () => {
		const t = (k: string, v?: Record<string, string>) => `${k}:${v?.repo ?? ''}`;
		expect(titleFor(mk({ type: 'ci_failed', payload: { repo: 'o/r' } }), t)).toBe('ci_failed:o/r');
	});
});

describe('groupByDay', () => {
	it('groups by calendar day, newest first', () => {
		const g = groupByDay([mk({ id: '1', created_at: '2026-07-18 09:00:00' }), mk({ id: '2', created_at: '2026-07-17 09:00:00' })]);
		expect(g.map(x => x.day)).toEqual(['2026-07-18', '2026-07-17']);
	});
});

describe('dbTimestampToDate', () => {
	it('parses a naive SQLite timestamp (space, no tz) as UTC', () => {
		expect(dbTimestampToDate('2026-07-18 10:00:00').getTime()).toBe(Date.UTC(2026, 6, 18, 10, 0, 0));
	});
	it('leaves an ISO string with Z intact', () => {
		expect(dbTimestampToDate('2026-07-18T10:00:00Z').getTime()).toBe(Date.UTC(2026, 6, 18, 10, 0, 0));
	});
	it('returns an invalid Date for empty/nullish input', () => {
		expect(Number.isNaN(dbTimestampToDate('').getTime())).toBe(true);
		expect(Number.isNaN(dbTimestampToDate(null).getTime())).toBe(true);
	});
});
