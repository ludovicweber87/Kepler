import type { RepoScript } from '@/types';

type Sortable = Pick<RepoScript, 'name' | 'sort_order' | 'created_at'>;

/**
 * Ordre d'affichage : `sort_order` croissant, puis `created_at` pour départager.
 * Ne modifie pas le tableau reçu.
 */
export function sortScripts<T extends Sortable>(scripts: T[]): T[] {
	return [...scripts].sort(
		(a, b) =>
			(a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at),
	);
}

/**
 * Scripts rendus dans la topbar : ceux qui ont un nom, triés. Une ligne
 * fraîchement créée dans les settings n'a pas encore de nom et ne doit pas
 * apparaître sous forme de bouton anonyme.
 */
export function visibleScripts<T extends Sortable>(scripts: T[]): T[] {
	return sortScripts(scripts.filter((s) => s.name.trim() !== ''));
}

/** `sort_order` à donner au prochain script créé. */
export function nextSortOrder(scripts: Pick<RepoScript, 'sort_order'>[]): number {
	if (scripts.length === 0) return 0;
	return Math.max(...scripts.map((s) => s.sort_order ?? 0)) + 1;
}
