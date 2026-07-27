import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { appSettings } from './schema';

/**
 * La table est créée avec le DEFAULT SQL hérité, exactement comme dans la base
 * réelle : la migration ne le retire pas (SQLite ne sait pas modifier un défaut
 * de colonne). Le test vérifie donc que Drizzle fournit sa propre valeur et que
 * ce défaut résiduel ne s'applique jamais.
 */
function makeDb() {
	const sqlite = new Database(':memory:');
	sqlite.exec(`CREATE TABLE app_settings (
		id text PRIMARY KEY NOT NULL,
		key text NOT NULL UNIQUE,
		value text DEFAULT '',
		updated_at text DEFAULT (datetime('now'))
	);`);
	return { sqlite, db: drizzle(sqlite) };
}

describe('helper timestamp() du schéma', () => {
	it("écrit de l'ISO UTC quand la colonne est omise à l'insert", () => {
		const { sqlite, db } = makeDb();
		db.insert(appSettings).values({ key: 'k', value: 'v' }).run();
		const row = sqlite.prepare('SELECT updated_at FROM app_settings').get() as {
			updated_at: string;
		};
		// L'assertion qui compte : un `.default(sql...)` resté à côté du
		// `$defaultFn` ferait gagner le défaut SQL, et cette valeur finirait
		// par une seconde sans Z.
		expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});

	it('produit une valeur relisible par Date sans décalage', () => {
		const { sqlite, db } = makeDb();
		const before = Date.now();
		db.insert(appSettings).values({ key: 'k2', value: 'v' }).run();
		const row = sqlite.prepare("SELECT updated_at FROM app_settings WHERE key='k2'").get() as {
			updated_at: string;
		};
		const parsed = new Date(row.updated_at).getTime();
		// Une valeur interprétée dans le mauvais fuseau dériverait d'heures.
		expect(Math.abs(parsed - before)).toBeLessThan(5000);
	});
});
