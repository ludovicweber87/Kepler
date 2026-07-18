import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { insertNotification, insertAndEmit } from './insert.js';
import { notificationStore } from './store.js';
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

describe('insertAndEmit', () => {
	let chunks: string[] = [];
	let unsubscribe: (() => void) | null = null;

	beforeEach(() => {
		chunks = [];
		const fake = { write: (s: string) => { chunks.push(s); } } as unknown as import('node:http').ServerResponse;
		unsubscribe = notificationStore.subscribe(fake);
	});

	afterEach(() => {
		if (unsubscribe) unsubscribe();
	});

	it('does nothing if db is null', () => {
		insertAndEmit(null, notif());
		expect(chunks).toHaveLength(0);
		expect(db.prepare('SELECT COUNT(*) c FROM notifications').get()).toEqual({ c: 0 });
	});

	it('emits exactly one SSE data chunk with no dedupe_key', () => {
		insertAndEmit(db, notif());
		expect(chunks).toHaveLength(1);
		const emitted = JSON.parse(chunks[0].replace(/^data: /, '').replace(/\n\n$/, ''));
		expect(emitted).toHaveProperty('id');
		expect(emitted).toHaveProperty('type', 'agent_done');
		expect(emitted).toHaveProperty('read_at', null);
		expect(emitted).not.toHaveProperty('dedupe_key');
	});

	it('deduplicates on dedupe_key (second call emits nothing)', () => {
		insertAndEmit(db, notif());
		expect(chunks).toHaveLength(1);
		insertAndEmit(db, notif());
		expect(chunks).toHaveLength(1);
	});
});
