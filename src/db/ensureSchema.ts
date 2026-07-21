import type { Database } from 'better-sqlite3';
import { getTableConfig, SQLiteTable, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { is, SQL } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Filet de sécurité idempotent exécuté après les migrations Drizzle.
 *
 * La DB locale d'un dev peut diverger du journal des migrations (une migration
 * réécrite/squashée occupe déjà son slot → Drizzle ne la rejoue jamais). On
 * réconcilie alors la base avec `schema.ts` : on crée les tables manquantes et
 * on ajoute les colonnes manquantes. No-op sur une base déjà à jour ou fraîche.
 *
 * Best-effort : chaque erreur est loggée mais n'interrompt pas le boot.
 */

const dialect = new SQLiteSyncDialect();

type AnyColumn = ReturnType<typeof getTableConfig>['columns'][number];

/** Clause DEFAULT pour une définition de colonne dans un CREATE TABLE. */
function defaultClause(col: AnyColumn): string {
	// PK alimentée par un $defaultFn JS (randomUUID) → pas de DEFAULT SQL.
	if (col.primary && col.default === undefined) return '';
	if (!col.hasDefault) return '';
	const d = col.default;
	if (is(d, SQL)) return ` DEFAULT ${dialect.sqlToQuery(d).sql}`;
	if (d === undefined) return '';
	if (typeof d === 'string') return ` DEFAULT '${d.replace(/'/g, "''")}'`;
	if (typeof d === 'number') return ` DEFAULT ${d}`;
	if (typeof d === 'boolean') return ` DEFAULT ${d ? 1 : 0}`;
	return ` DEFAULT '${JSON.stringify(d).replace(/'/g, "''")}'`; // colonnes json
}

function createTableDDL(table: SQLiteTable): string {
	const cfg = getTableConfig(table);
	const cols = cfg.columns.map((c) => {
		let s = `\t"${c.name}" ${c.getSQLType()}`;
		if (c.primary) s += ' PRIMARY KEY';
		if (c.notNull) s += ' NOT NULL';
		if (c.isUnique) s += ' UNIQUE';
		s += defaultClause(c);
		return s;
	});
	return `CREATE TABLE IF NOT EXISTS \`${cfg.name}\` (\n${cols.join(',\n')}\n);`;
}

function createIndexDDLs(table: SQLiteTable): string[] {
	const cfg = getTableConfig(table);
	return cfg.indexes.map((idx) => {
		const { name, columns, unique } = idx.config;
		const colNames = columns
			.map((c) => ('name' in c ? `\`${(c as { name: string }).name}\`` : ''))
			.filter(Boolean)
			.join(', ');
		return `CREATE ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS \`${name}\` ON \`${cfg.name}\` (${colNames});`;
	});
}

/** ALTER pour ajouter une colonne manquante. SQLite interdit un DEFAULT non-constant. */
function addColumnDDL(tableName: string, col: AnyColumn): string {
	let s = `ALTER TABLE \`${tableName}\` ADD COLUMN "${col.name}" ${col.getSQLType()}`;
	const d = col.default;
	const constDefault = col.hasDefault && !is(d, SQL) && d !== undefined && typeof d !== 'object';
	// NOT NULL sur ADD COLUMN exige un DEFAULT constant ; sinon on relâche la
	// contrainte pour ne pas planter (cas rare, on log).
	if (col.notNull && constDefault) s += ' NOT NULL';
	if (constDefault) {
		if (typeof d === 'string') s += ` DEFAULT '${d.replace(/'/g, "''")}'`;
		else if (typeof d === 'number') s += ` DEFAULT ${d}`;
		else if (typeof d === 'boolean') s += ` DEFAULT ${d ? 1 : 0}`;
	}
	return s;
}

export function ensureSchema(sqlite: Database): void {
	const tables = Object.values(schema).filter((t) => is(t, SQLiteTable)) as SQLiteTable[];

	const existing = new Set(
		sqlite
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all()
			.map((r) => (r as { name: string }).name),
	);

	for (const table of tables) {
		const cfg = getTableConfig(table);
		try {
			if (!existing.has(cfg.name)) {
				sqlite.exec(createTableDDL(table));
				for (const idx of createIndexDDLs(table)) sqlite.exec(idx);
				console.warn(`[ensureSchema] created missing table "${cfg.name}"`);
				continue;
			}

			const present = new Set(
				sqlite
					.prepare(`PRAGMA table_info(\`${cfg.name}\`)`)
					.all()
					.map((r) => (r as { name: string }).name),
			);
			for (const col of cfg.columns) {
				if (present.has(col.name)) continue;
				sqlite.exec(addColumnDDL(cfg.name, col));
				console.warn(`[ensureSchema] added missing column "${cfg.name}.${col.name}"`);
			}
		} catch (err) {
			console.warn(
				`[ensureSchema] reconciliation failed for "${cfg.name}":`,
				err instanceof Error ? err.message : err,
			);
		}
	}
}
