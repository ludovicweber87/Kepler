import { realpathSync } from 'node:fs';

/**
 * Résolution des chemins de dépôt/worktree en leur chemin réel (symlinks résolus).
 *
 * `git worktree list` renvoie toujours le realpath. Si un chemin est saisi via un
 * symlink (ex. `~/Documents/Lab` → `~/Lab`), tout ce qui compare un chemin stocké en
 * base au chemin renvoyé par git rate silencieusement : la sidebar ne reconnaît plus
 * la session d'un worktree et réaffiche les worktrees archivés. On normalise donc à
 * l'écriture pour que les deux côtés parlent du même chemin.
 *
 * Module côté serveur uniquement (`node:fs`) : à n'importer que depuis les routes API.
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

/** Variante tolérante pour les colonnes nullables : vide/absent → `null`. */
export function realPathOrNull(path: string | null | undefined): string | null {
	if (!path || !path.trim()) return null;
	return realPath(path);
}
