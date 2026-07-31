import type { Persona } from '@/types';

/** Valeur d'onglet « tous les repos confondus ». */
export const ALL_REPOS = 'all';

/**
 * Ramène l'onglet actif sur une valeur affichable : `ALL_REPOS` dès que le repo
 * ne fait plus partie des repos configurés (path supprimé dans les settings
 * alors qu'il était sélectionné). Sans ça, l'onglet retomberait visuellement
 * sur « Tous » pendant que le filtre continuerait de ne rien matcher.
 */
export function resolveActiveRepo(activeRepo: string, repos: string[]): string {
	if (activeRepo === ALL_REPOS) return ALL_REPOS;
	return repos.includes(activeRepo) ? activeRepo : ALL_REPOS;
}

/**
 * Personas rattachées au repo demandé. `ALL_REPOS` ne filtre rien. Une persona
 * sans repo est globale : elle apparaît dans tous les onglets.
 */
export function filterPersonasByRepo(personas: Persona[], repo: string): Persona[] {
	if (repo === ALL_REPOS) return personas;
	return personas.filter((p) => !p.repos?.length || p.repos.includes(repo));
}

/** Repos d'une persona, dans l'ordre d'affichage des onglets. */
export function reposOfPersona(persona: Persona, repos: string[]): string[] {
	const own = persona.repos ?? [];
	return repos.filter((r) => own.includes(r));
}

/** `owner/repo` → `repo`, pour les libellés courts (onglets, chips). */
export function shortRepoName(repoFullName: string): string {
	return repoFullName.split('/').pop() ?? repoFullName;
}

/**
 * Couleur d'onglet d'un repo. Dérivée du nom (et non de sa position) pour rester
 * stable quand l'utilisateur ajoute ou retire un repo dans les settings.
 */
export function repoColor(repoFullName: string, palette: string[]): string {
	let hash = 0;
	for (let i = 0; i < repoFullName.length; i++) {
		hash = (hash * 31 + repoFullName.charCodeAt(i)) % 100003;
	}
	return palette[hash % palette.length];
}
