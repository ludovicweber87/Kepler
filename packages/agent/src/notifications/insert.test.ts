import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { insertNotification } from './insert.js';
import type { NewNotification } from './types.js';

let db: Database.Database;
beforeEach(() => {
	db = new Database(':memory:');
	db.exec(`CREATE TABLE notifications (
		id TEXT PRIMARY KEY, source TEXT NOT NULL, type TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal',
		title TEXT DEFAULT '', body TEXT DEFAULT '', url TEXT DEFAULT '',
		entity_ref TEXT, payload TEXT DEFAULT '{}', dedupe_key TEXT NOT NULL UNIQUE,
		read_at TEXT, created_at TEXT DEFAULT (datetime('now')));`);
});

const notif = (over: Partial<NewNotification> = {}): NewNotification => ({
	source: 'agent', type: 'agent_done', priority: 'normal', title: 't', body: '', url: '/w',
	entity_ref: { kind: 'session', id: 's1' }, payload: {}, dedupe_key: 'agent_done:s1:1', ...over,
});

describe('insertNotification', () => {
	it('inserts a new row and returns it', () => {
		const row = insertNotification(db, notif());
		expect(row).not.toBeNull();
		expect(row!.id).toBeTruthy();
		expect(row!.dedupe_key).toBe('agent_done:s1:1');
		expect(row!.read_at).toBeNull();
	});
	it('returns null on duplicate dedupe_key', () => {
		insertNotification(db, notif());
		expect(insertNotification(db, notif())).toBeNull();
		expect(db.prepare('SELECT COUNT(*) c FROM notifications').get()).toEqual({ c: 1 });
	});
	it('serializes entity_ref and payload as JSON', () => {
		const row = insertNotification(db, notif({ payload: { a: 'b' } }));
		expect(row!.payload).toEqual({ a: 'b' });
		expect(row!.entity_ref).toEqual({ kind: 'session', id: 's1' });
	});
});
