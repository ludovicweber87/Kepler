import { realpathSync } from 'node:fs';

/**
 * Résolution des chemins de dépôt/worktree en leur chemin réel (symlinks résolus).
 *
 * `git worktree list` renvoie toujours le realpath. Si le `cwd` arrive via un symlink
 * (ex. `~/Documents/Lab` → `~/Lab`), toute comparaison de chemins rate silencieusement :
 * le worktree principal n'est plus filtré de la liste, et le nettoyage des sessions
 * liées à un worktree supprimé ne trouve plus rien. On normalise donc dès l'entrée.
 *
 * Jumeau côté web : `src/lib/realPath.ts`.
 */

/** Retire le(s) slash(es) final(aux), sauf pour la racine `/`. */
export function trimTrailingSlash(path: string): string {
	const trimmed = path.replace(/\/+$/, '');
	return trimmed === '' ? path.slice(0, 1) : trimmed;
}

/**
 * Chemin réel de `path` : symlinks résolus et slash final retiré.
 * Chemin inexistant (dossier pas encore créé, disque démonté) → on rend l'entrée
 * nettoyée plutôt que de lever, la normalisation est un confort, pas une validation.
 */
export function realPath(path: string): string {
	const trimmed = trimTrailingSlash(path.trim());
	try {
		return realpathSync.native(trimmed);
	} catch {
		return trimmed;
	}
}
