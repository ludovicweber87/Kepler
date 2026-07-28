import Database from 'better-sqlite3';
import { resolveDbPath } from './dbPath.js';

/**
 * Handle partagé vers la DB SQLite possédée par l'app Next.js (`data/kepler.db`).
 * Les migrations sont jouées par l'app Next ; ici on ouvre uniquement un fichier existant.
 * Tant que la DB n'a pas été créée, `getDb()` renvoie `null` et les appelants dégradent
 * proprement (handle optionnel).
 */
let _db: Database.Database | null = null;

// Hook de test : permet d'injecter une DB de substitution (ex. `:memory:`)
// sans toucher au fichier réel `data/kepler.db`.
let _testOverride: Database.Database | null = null;
export function __setDbForTests(db: Database.Database | null): void {
	_testOverride = db;
}
export function __resetDbForTests(): void {
	_testOverride = null;
}

export function getDb(): Database.Database | null {
	if (_testOverride) return _testOverride;
	if (_db) return _db;
	try {
		_db = new Database(resolveDbPath(), { fileMustExist: true });
		_db.pragma('journal_mode = WAL');
	} catch {
		_db = null;
	}
	return _db;
}
