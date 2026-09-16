/**
 * Classement des propositions d'autocomplétion du composer. Logique pure,
 * partagée par les commandes (`/`) et les fichiers (`@`).
 */

/**
 * Un menu plus long ne se lit plus et coûte cher à monter : sur un monorepo,
 * `@s` matche des milliers de fichiers. On tronque au meilleur score.
 */
export const MAX_MENTION_RESULTS = 50;

/**
 * Score d'une entrée face à la saisie — plus petit = meilleur, `null` = pas de match.
 *
 * L'ordre voulu : préfixe du chemin complet, puis préfixe du dernier segment (le
 * nom de fichier, ce que l'utilisateur tape le plus souvent), puis sous-chaîne
 * (d'autant mieux classée qu'elle apparaît tôt), et enfin sous-séquence pour
 * rattraper une frappe approximative. Insensible à la casse.
 */
export function scoreMention(candidate: string, query: string): number | null {
	if (!query) return 0;
	const c = candidate.toLowerCase();
	const q = query.toLowerCase();
	if (c.startsWith(q)) return 0;
	const lastSegment = c.slice(c.lastIndexOf('/') + 1);
	if (lastSegment.startsWith(q)) return 1;
	const at = c.indexOf(q);
	// Position plafonnée : au-delà, « plus loin » n'apporte plus d'information utile
	// et laisserait un match tardif passer derrière une sous-séquence.
	if (at !== -1) return 2 + Math.min(at, 50);
	return isSubsequence(c, q) ? 100 : null;
}

/** `q` apparaît-il dans `hay` dans l'ordre, sans être forcément contigu ? */
function isSubsequence(hay: string, needle: string): boolean {
	let i = 0;
	for (const ch of hay) {
		if (ch === needle[i]) i++;
		if (i === needle.length) return true;
	}
	return i === needle.length;
}

/**
 * Filtre et classe `items`. `keysOf` renvoie toutes les chaînes par lesquelles une
 * entrée peut être trouvée (un nom de commande et ses alias, par exemple) : on
 * garde son meilleur score. A score égal, l'ordre d'entrée est préservé — les
 * commandes arrivent déjà triées par nom, les fichiers dans l'ordre de `git ls-files`.
 */
export function filterMentions<T>(
	items: readonly T[],
	query: string,
	keysOf: (item: T) => string[],
	limit: number = MAX_MENTION_RESULTS,
): T[] {
	const scored: { item: T; score: number; index: number }[] = [];
	items.forEach((item, index) => {
		let best: number | null = null;
		for (const key of keysOf(item)) {
			const score = scoreMention(key, query);
			if (score !== null && (best === null || score < best)) best = score;
		}
		if (best !== null) scored.push({ item, score: best, index });
	});
	scored.sort((a, b) => a.score - b.score || a.index - b.index);
	return scored.slice(0, limit).map((s) => s.item);
}
