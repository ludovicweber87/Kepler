import type { FileDiff } from './gitDiff';

export const CHAT_TAB = 'chat';

/** Trouve le FileDiff pour un chemin relatif repo OU absolu (match par suffixe). */
export function matchFileDiff(files: FileDiff[], path: string | null): FileDiff | undefined {
	if (!path) return undefined;
	return files.find((f) => f.path === path || path.endsWith(`/${f.path}`));
}

/** Ajoute un chemin à la liste des fichiers ouverts (pas de doublon, ordre préservé). */
export function addOpenFile(openFiles: string[], path: string): string[] {
	return openFiles.includes(path) ? openFiles : [...openFiles, path];
}

/**
 * Onglet actif après fermeture de `closing`.
 * Si l'onglet fermé n'est pas actif, l'actif est conservé.
 * Sinon on prend le voisin de gauche, à défaut celui de droite, à défaut le chat.
 */
export function resolveTabAfterClose(
	openFiles: string[],
	closing: string,
	active: string,
): string {
	if (active !== closing) return active;
	const idx = openFiles.indexOf(closing);
	const remaining = openFiles.filter((p) => p !== closing);
	if (remaining.length === 0) return CHAT_TAB;
	const neighbour = remaining[idx - 1] ?? remaining[idx] ?? remaining[0];
	return neighbour ?? CHAT_TAB;
}
