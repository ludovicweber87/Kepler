import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DB_PATH } from '../packages/cli/core/paths.mjs';

/**
 * Régénère la bibliothèque seedée (`packages/cli/core/personas.mjs`) depuis les personas
 * de la base locale.
 *
 *   node scripts/dump-personas.mjs [chemin/vers/base.db]
 *
 * Le seed était retranscrit à la main, et il avait dérivé : il décrivait une bibliothèque
 * qui n'existait pas en base. Extraire depuis la base rend l'écart impossible — on retouche
 * ses personas dans l'UI, on relance ce script, le seed suit.
 *
 * Seul le tableau `PERSONAS` est réécrit ; la logique de seed en dessous n'est pas touchée.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, '..', 'packages', 'cli', 'core', 'personas.mjs');
const MARK_START = 'export const PERSONAS = [';
const MARK_END = '];';

const dbPath = process.argv[2] ?? DB_PATH;
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const rows = db
	.prepare(
		`select id, name, role, system_prompt, model, effort, permission_mode, color
		 from personas order by name collate nocase`,
	)
	.all();
db.close();

if (!rows.length) throw new Error(`Aucune persona dans ${dbPath}.`);

// `JSON.stringify` produit exactement le style du fichier : chaîne double-quote avec des
// `\n` échappés. Un littéral de gabarit obligerait à échapper chaque backtick des prompts.
const body = rows
	.map((r) => {
		const field = (k, v) => `\t\t${k}: ${v === null ? 'null' : JSON.stringify(v)},`;
		return [
			'\t{',
			field('id', r.id),
			field('name', r.name),
			field('role', r.role),
			field('color', r.color),
			field('model', r.model),
			field('effort', r.effort),
			field('permission_mode', r.permission_mode),
			field('system_prompt', r.system_prompt),
			'\t},',
		].join('\n');
	})
	.join('\n');

const src = readFileSync(TARGET, 'utf-8');
const start = src.indexOf(MARK_START);
if (start === -1) throw new Error(`\`${MARK_START}\` introuvable dans ${TARGET}.`);
const end = src.indexOf(`\n${MARK_END}`, start);
if (end === -1) throw new Error(`Fin du tableau PERSONAS introuvable dans ${TARGET}.`);

writeFileSync(
	TARGET,
	`${src.slice(0, start)}${MARK_START}\n${body}\n${src.slice(end + 1)}`,
	'utf-8',
);

console.log(`✓ ${rows.length} personas écrites depuis ${dbPath} :`);
for (const r of rows) console.log(`  · ${r.name} — ${r.model}/${r.effort}/${r.permission_mode}`);
console.log('\nLance `npx prettier --write packages/cli/core/personas.mjs` pour finir.');
