/** Cap du nombre de chemins renvoyés par /filesystem/tree. */
export const MAX_TREE_FILES = 20_000;

export interface LsFilesResult {
	files: string[];
	truncated: boolean;
}

/**
 * Découpe la sortie de `git ls-files -z`. Le séparateur NUL est le seul octet
 * qu'un nom de fichier ne peut pas contenir : on ne trim pas les segments,
 * sinon un nom se terminant par une espace serait corrompu.
 * Combiner --cached et --others peut lister deux fois le même chemin, d'où le Set.
 */
export function parseLsFiles(raw: string, max = MAX_TREE_FILES): LsFilesResult {
	const seen = new Set<string>();
	for (const entry of raw.split('\0')) {
		if (!entry) continue;
		seen.add(entry);
	}
	const all = [...seen];
	return { files: all.slice(0, max), truncated: all.length > max };
}
