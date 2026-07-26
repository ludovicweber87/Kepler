import type { Persona } from '@/types';

export interface PersonaIdentity {
	/** Persona active de la session, `null` si aucune (ou persona supprimée). */
	personaId: string | null;
	/** Nom à afficher dans le chip du composer, `null` → label neutre côté UI. */
	name: string | null;
	/** Couleur de la persona, `null` → couleur neutre côté UI. */
	color: string | null;
}

const EMPTY: PersonaIdentity = { personaId: null, name: null, color: null };

/**
 * Identité de persona d'une session, pilotée **uniquement** par `persona_id`.
 *
 * Ne lit jamais `agent_name` / `agent_color` : ce sont le label et la couleur du
 * worktree, réécrits dans le dos du composer par l'auto-rename (titre dérivé du
 * premier prompt) et par les renommages manuels. Un choix de persona doit rester
 * stable, donc il ne dérive que de son identifiant.
 *
 * Un `persona_id` pointant sur une persona supprimée est traité comme « sans
 * persona » (plutôt que d'afficher un nom fantôme).
 */
export function resolvePersonaIdentity(
	session: { persona_id?: string | null } | null | undefined,
	personas: Persona[],
): PersonaIdentity {
	const personaId = session?.persona_id?.trim() || null;
	if (!personaId) return EMPTY;
	const persona = personas.find((p) => p.id === personaId);
	if (!persona) return EMPTY;
	return { personaId: persona.id, name: persona.name, color: persona.color };
}
