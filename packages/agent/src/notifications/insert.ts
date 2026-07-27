import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { NOW_ISO } from '../helpers.js';
import type { NewNotification } from './types.js';
import { notificationStore, type EmittedNotification } from './store.js';

export interface InsertedRow extends EmittedNotification {
	dedupe_key: string;
}

export function insertNotification(db: Database.Database, n: NewNotification): InsertedRow | null {
	const id = randomUUID();
	const info = db.prepare(
		`INSERT OR IGNORE INTO notifications
		 (id, source, type, priority, title, body, url, entity_ref, payload, dedupe_key, read_at, created_at)
		 VALUES (@id, @source, @type, @priority, @title, @body, @url, @entity_ref, @payload, @dedupe_key, NULL, ${NOW_ISO})`
	).run({
		id, source: n.source, type: n.type, priority: n.priority,
		title: n.title, body: n.body, url: n.url,
		entity_ref: JSON.stringify(n.entity_ref), payload: JSON.stringify(n.payload),
		dedupe_key: n.dedupe_key,
	});
	if (info.changes === 0) return null;
	const raw = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Record<string, unknown>;
	return {
		id: raw.id as string, source: raw.source as string, type: raw.type as string, priority: raw.priority as string,
		title: raw.title as string, body: raw.body as string, url: raw.url as string,
		entity_ref: raw.entity_ref ? JSON.parse(raw.entity_ref as string) : null,
		payload: raw.payload ? JSON.parse(raw.payload as string) : {},
		read_at: (raw.read_at as string | null) ?? null, created_at: raw.created_at as string,
		dedupe_key: raw.dedupe_key as string,
	};
}

export function insertAndEmit(db: Database.Database | null, n: NewNotification): void {
	if (!db) return;
	const row = insertNotification(db, n);
	if (!row) return;
	const { dedupe_key: _dedupe_key, ...emitted } = row;
	notificationStore.emit(emitted);
}
