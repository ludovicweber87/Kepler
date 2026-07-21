import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'fs';
import { join } from 'path';
import * as schema from './schema';
import { ensureSchema } from './ensureSchema';

const DB_PATH = process.env.DEVORA_DB_PATH ?? join(process.cwd(), 'data', 'devora.db');

// Ensure data directory exists
mkdirSync(join(process.cwd(), 'data'), { recursive: true });

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Run migrations at runtime only — NEVER during `next build`.
// `next build` imports this module while collecting page data, which would run
// migrations against whatever DB is on disk. Plain CREATE TABLE statements crash
// when that build-time DB is stale/desynced (migration records lagging behind
// tables that already exist), breaking the build. Migrations belong to runtime.
if (process.env.NEXT_PHASE !== 'phase-production-build') {
	migrate(db, { migrationsFolder: join(process.cwd(), 'src', 'db', 'migrations') });
	// Filet de sécurité : réconcilie la base avec le schéma quand le journal des
	// migrations a divergé (migration réécrite dont le slot est déjà "appliqué").
	ensureSchema(sqlite);
}

export { schema };
