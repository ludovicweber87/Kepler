import type { Persona, PersonaFolder } from '@/types';

/** Valeur d'onglet « tous les folders confondus ». */
export const ALL_FOLDERS = 'all';

/**
 * Ramène un id de folder actif sur une valeur affichable : `ALL_FOLDERS` dès que
 * l'id ne correspond plus à un folder existant (folder supprimé alors qu'il était
 * sélectionné). Sans ça, l'onglet retomberait visuellement sur « Tout » pendant
 * que le filtre, lui, continuerait de ne rien matcher.
 */
export function resolveActiveFolder(activeId: string, folders: PersonaFolder[]): string {
	if (activeId === ALL_FOLDERS) return ALL_FOLDERS;
	return folders.some((f) => f.id === activeId) ? activeId : ALL_FOLDERS;
}

/** Personas rangées dans le folder demandé. `ALL_FOLDERS` ne filtre rien. */
export function filterPersonasByFolder(personas: Persona[], folderId: string): Persona[] {
	if (folderId === ALL_FOLDERS) return personas;
	return personas.filter((p) => p.folder_ids?.includes(folderId));
}

/** Folders d'une persona, dans l'ordre d'affichage des onglets. */
export function foldersOfPersona(persona: Persona, folders: PersonaFolder[]): PersonaFolder[] {
	const ids = persona.folder_ids ?? [];
	return folders.filter((f) => ids.includes(f.id));
}
