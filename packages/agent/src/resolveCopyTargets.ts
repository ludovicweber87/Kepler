import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

/** Sortie `-z` d'une commande git → ensemble de chemins relatifs. Vide si la commande échoue. */
function gitPaths(cwd: string, args: string[]): Set<string> {
	try {
		const out = execFileSync('git', args, {
			cwd,
			encoding: 'utf-8',
			timeout: 10000,
			maxBuffer: 10 * 1024 * 1024,
			// stderr muet : hors repo git, l'échec est un cas nominal (fail-open).
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		return new Set(out.split('\0').filter((p) => p.length > 0));
	} catch {
		return new Set();
	}
}

/**
 * Écarte les fichiers que git fournit déjà au worktree : suivis dans `sourceDir` et identiques
 * à HEAD.
 *
 * Le worktree est créé sur `origin/<base>` tout juste fetchée, alors que le repo principal peut
 * être resté des dizaines de commits en arrière. Y recopier un fichier versionné et intact
 * (typiquement un `.env` d'app committé avec ses valeurs par défaut) ramène la version périmée
 * par-dessus la fraîche : le worktree naît sale, avec un diff fait de suppressions.
 *
 * Un fichier suivi *mais localement modifié* reste copié : ces modifications locales sont
 * précisément ce que `files_to_copy` sert à transporter.
 *
 * Dégrade proprement : si git est muet (pas un repo, commande en échec), tout est copié comme avant.
 */
export function dropPristineTracked(sourceDir: string, rels: string[]): string[] {
	if (rels.length === 0) return rels;
	const tracked = gitPaths(sourceDir, ['ls-files', '-z', '--', ...rels]);
	if (tracked.size === 0) return rels;
	const modified = gitPaths(sourceDir, ['diff', '--name-only', '-z', 'HEAD', '--', ...rels]);
	return rels.filter((rel) => !tracked.has(rel) || modified.has(rel));
}
