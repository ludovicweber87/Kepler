#!/usr/bin/env node
/**
 * sync-worktree-env — recopie les fichiers de config (ex. .env.local) depuis un repo source
 * vers un worktree cible, en les retrouvant récursivement et en les remettant au même
 * chemin relatif.
 *
 * Usage :
 *   node scripts/sync-worktree-env.mjs --source <repo> --target <worktree> [--files ".env\n.env.local"] [--dry]
 *
 * Défauts :
 *   --source : worktree principal (git worktree list, première entrée)
 *   --target : répertoire courant
 *   --files  : lu depuis le réglage `files_to_copy` du repo (DB Kepler) ; sinon `.env*` racine.
 */
import { readdirSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname, sep, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const IGNORED_DIRS = new Set([
	'node_modules',
	'.git',
	'.worktrees',
	'dist',
	'build',
	'.next',
	'.turbo',
	'coverage',
]);

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--dry') out.dry = true;
		else if (a === '--source') out.source = argv[++i];
		else if (a === '--target') out.target = argv[++i];
		else if (a === '--files') out.files = argv[++i];
	}
	return out;
}

function walk(dir, baseDir, acc) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (IGNORED_DIRS.has(entry.name)) continue;
			walk(full, baseDir, acc);
		} else if (entry.isFile()) {
			acc.push(full.slice(baseDir.length + 1));
		}
	}
}

function resolveCopyTargets(sourceDir, entries) {
	const results = new Set();
	let allFiles = null;
	const ensureAllFiles = () => {
		if (!allFiles) {
			allFiles = [];
			walk(sourceDir, sourceDir, allFiles);
		}
		return allFiles;
	};
	for (const raw of entries) {
		const entry = raw.replace(/^\.\//, '');
		if (!entry) continue;
		if (entry.includes('/')) {
			if (existsSync(join(sourceDir, entry))) results.add(entry);
		} else {
			for (const rel of ensureAllFiles()) {
				if (rel.split(sep).pop() === entry) results.add(rel);
			}
		}
	}
	return [...results];
}

function parseFilesToCopy(text) {
	return (text ?? '')
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
}

function defaultSource() {
	try {
		const out = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
		const first = out.split('\n').find((l) => l.startsWith('worktree '));
		if (first) return first.replace('worktree ', '').trim();
	} catch {
		/* ignore */
	}
	return process.cwd();
}

async function readFilesToCopyFromDb(sourcePath) {
	// Les entrées `.devora` / `devora.db` sont les emplacements d'avant le renommage :
	// tant qu'une machine n'a pas été migrée, c'est là que vit la vraie base.
	const candidates = [
		process.env.KEPLER_DB_PATH,
		process.env.DEVORA_DB_PATH,
		join(homedir(), '.kepler', 'kepler.db'),
		join(process.cwd(), 'data', 'kepler.db'),
		join(homedir(), '.devora', 'devora.db'),
		join(process.cwd(), 'data', 'devora.db'),
	].filter(Boolean);
	for (const dbPath of candidates) {
		if (!existsSync(dbPath)) continue;
		try {
			const { default: Database } = await import('better-sqlite3');
			const db = new Database(dbPath, { readonly: true, fileMustExist: true });
			const row = db
				.prepare(
					`SELECT s.files_to_copy AS files
					 FROM repo_settings s
					 JOIN repo_paths p ON p.repo_full_name = s.repo_full_name
					 WHERE p.local_path = ?`,
				)
				.get(sourcePath);
			db.close();
			if (row?.files) return row.files;
		} catch {
			/* better-sqlite3 indisponible ou DB illisible → on ignore */
		}
	}
	return '';
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const source = resolve(args.source ?? defaultSource());
	const target = resolve(args.target ?? process.cwd());

	if (source === target) {
		console.error('✗ source et target sont identiques, rien à faire.');
		process.exit(1);
	}
	if (!existsSync(source)) {
		console.error(`✗ source introuvable : ${source}`);
		process.exit(1);
	}
	if (!existsSync(target)) {
		console.error(`✗ target introuvable : ${target}`);
		process.exit(1);
	}

	const filesText = args.files ?? (await readFilesToCopyFromDb(source));
	const entries = parseFilesToCopy(filesText);
	const rels =
		entries.length > 0
			? resolveCopyTargets(source, entries)
			: readdirSync(source).filter((f) => f.startsWith('.env'));

	console.log(`source : ${source}`);
	console.log(`target : ${target}`);
	console.log(`config : ${entries.length > 0 ? entries.join(', ') : '(défaut .env* racine)'}`);

	if (rels.length === 0) {
		console.log('Aucun fichier à copier.');
		return;
	}

	let copied = 0;
	for (const rel of rels) {
		const src = join(source, rel);
		if (!existsSync(src)) continue;
		const dest = join(target, rel);
		if (args.dry) {
			console.log(`• (dry) ${rel}`);
			continue;
		}
		mkdirSync(dirname(dest), { recursive: true });
		copyFileSync(src, dest);
		console.log(`✓ ${rel}`);
		copied++;
	}
	console.log(
		args.dry ? `${rels.length} fichier(s) seraient copiés.` : `${copied} fichier(s) copié(s).`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
