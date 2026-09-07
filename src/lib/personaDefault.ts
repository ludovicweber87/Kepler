import type { Persona } from '@/types';

/**
 * Persona à présélectionner au lancement, parmi celles **disponibles** sur le
 * repo courant. L'invariant « une seule par défaut » est tenu par l'API, mais on
 * ne s'y fie pas ici : en cas de base incohérente (deux drapeaux à `true`), la
 * première dans l'ordre d'affichage gagne, plutôt que de ne rien présélectionner.
 *
 * Renvoie `null` quand aucune persona disponible n'est marquée par défaut — la
 * modale retombe alors sur « Sans persona ».
 */
export function pickDefaultPersona(personas: Persona[]): Persona | null {
	return personas.find((p) => p.is_default) ?? null;
}
