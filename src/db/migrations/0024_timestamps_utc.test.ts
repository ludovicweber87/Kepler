import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = readFileSync(join(process.cwd(), 'src/db/migrations/0024_timestamps_utc.sql'), 'utf8');

/** Une base minimale portant les deux formats et une colonne nullable. */
function seed() {
	const db = new Database(':memory:');
	db.exec(`CREATE TABLE agent_activity_logs (id text PRIMARY KEY, created_at text);`);
	db.exec(`CREATE TABLE agent_sessions (
		id text PRIMARY KEY, started_at text, ended_at text,
		report_published_at text, archived_at text);`);
	db.prepare('INSERT INTO agent_activity_logs VALUES (?, ?)').run('a', '2026-07-27 06:19:28');
	db.prepare('INSERT INTO agent_activity_logs VALUES (?, ?)').run('b', '2026-07-27T05:00:00.000Z');
	db.prepare('INSERT INTO agent_sessions VALUES (?, ?, ?, ?, ?)').run(
		's', '2026-07-27 06:19:28', null, null, null,
	);
	return db;
}

/**
 * N'applique que les instructions portant sur les tables de la base d'essai —
 * la migration réelle en touche quatorze, on n'en amorce que deux ici.
 */
function applyFor(db: Database.Database, tables: string[]) {
	const wanted = new Set(tables);
	for (const stmt of MIGRATION.split(';')) {
		const s = stmt.trim();
		if (!s) continue;
		const table = /^UPDATE\s+(\w+)\s/.exec(s)?.[1];
		if (table && wanted.has(table)) db.exec(s);
	}
}

describe('migration 0024 — timestamps en ISO UTC', () => {
	it("préserve l'instant, sans décalage de fuseau", () => {
		const db = seed();
		applyFor(db, ['agent_activity_logs']);
		const row = db.prepare("SELECT created_at FROM agent_activity_logs WHERE id='a'").get() as {
			created_at: string;
		};
		// 06:19:28 UTC doit rester 06:19:28 UTC. Une migration qui « corrigerait »
		// l'affichage en décalant de 2h corromprait les données.
		expect(row.created_at).toBe('2026-07-27T06:19:28.000Z');
	});

	it('laisse intacte une ligne déjà au format cible', () => {
		const db = seed();
		applyFor(db, ['agent_activity_logs']);
		const row = db.prepare("SELECT created_at FROM agent_activity_logs WHERE id='b'").get() as {
			created_at: string;
		};
		expect(row.created_at).toBe('2026-07-27T05:00:00.000Z');
	});

	it('est idempotente', () => {
		const db = seed();
		applyFor(db, ['agent_activity_logs']);
		const first = db.prepare('SELECT id, created_at FROM agent_activity_logs ORDER BY id').all();
		applyFor(db, ['agent_activity_logs']);
		const second = db.prepare('SELECT id, created_at FROM agent_activity_logs ORDER BY id').all();
		expect(second).toEqual(first);
	});

	it('rétablit un tri chronologique correct', () => {
		const db = seed();
		applyFor(db, ['agent_activity_logs']);
		const ids = (
			db.prepare('SELECT id FROM agent_activity_logs ORDER BY created_at').all() as {
				id: string;
			}[]
		).map((r) => r.id);
		// 'b' (05:00Z) précède 'a' (06:19Z). Avant migration, l'ordre lexicographique
		// plaçait 'a' en premier parce que l'espace précède le T.
		expect(ids).toEqual(['b', 'a']);
	});

	it('préserve les NULL des colonnes nullables', () => {
		const db = seed();
		applyFor(db, ['agent_sessions']);
		const row = db.prepare("SELECT * FROM agent_sessions WHERE id='s'").get() as Record<
			string,
			unknown
		>;
		expect(row.started_at).toBe('2026-07-27T06:19:28.000Z');
		expect(row.ended_at).toBeNull();
		expect(row.archived_at).toBeNull();
		expect(row.report_published_at).toBeNull();
	});
});
