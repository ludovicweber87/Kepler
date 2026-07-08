import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'fs';
import { join } from 'path';
import * as schema from './schema';

const DB_PATH = process.env.DEVORA_DB_PATH ?? join(process.cwd(), 'data', 'devora.db');

// Ensure data directory exists
mkdirSync(join(process.cwd(), 'data'), { recursive: true });

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Run migrations on first import
// Run migrations on first import
migrate(db, { migrationsFolder: join(process.cwd(), 'src', 'db', 'migrations') });

export { schema };
