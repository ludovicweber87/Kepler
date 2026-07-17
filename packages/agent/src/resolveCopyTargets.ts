import { readdirSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * Dossiers jamais explorés lors de la recherche récursive :
 * dépendances, artefacts de build et autres worktrees.
 */
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

function walk(dir: string, baseDir: string, acc: string[]): void {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		// On ne suit pas les symlinks (évite les boucles et les node_modules liés).
		if (entry.isDirectory()) {
			if (IGNORED_DIRS.has(entry.name)) continue;
			walk(full, baseDir, acc);
		} else if (entry.isFile()) {
			acc.push(full.slice(baseDir.length + 1));
		}
	}
}

/**
 * Résout les entrées de `files_to_copy` en chemins relatifs concrets, prêts à copier
 * au même emplacement dans le worktree cible.
 *
 * - Entrée contenant un `/` → chemin relatif explicite, conservé s'il existe.
 * - Entrée simple (ex. `.env.local`) → recherche récursive dans `sourceDir` ;
 *   tous les fichiers portant ce nom sont copiés à leur emplacement relatif.
 *
 * Les chemins sont dédupliqués et les dossiers ignorés (node_modules, .git, .worktrees, …)
 * ne sont jamais explorés.
 */
export function resolveCopyTargets(sourceDir: string, entries: string[]): string[] {
	const results = new Set<string>();
	let allFiles: string[] | null = null;
	const ensureAllFiles = (): string[] => {
		if (!allFiles) {
			allFiles = [];
			walk(sourceDir, sourceDir, allFiles);
		}
		return allFiles;
	};

	for (const raw of entries) {
		const entry = raw.replace(/^\.\//, '');
		if (entry.length === 0) continue;
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
