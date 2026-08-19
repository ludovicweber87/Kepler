/**
 * Marqueur de changement de persona « à chaud », transmis au modèle (option A).
 *
 * Le switch de rôle remplace le system prompt sans que le modèle en garde trace :
 * il « est » le nouveau persona mais ignore qu'un changement a eu lieu. Pour qu'il
 * le sache, on injecte ce marqueur au prochain tour user (donc zéro token au moment
 * du switch, et l'info arrive pile quand l'utilisateur reparle).
 */
export function buildPersonaNote(from: string | undefined, to: string): string {
  const body =
    from && from !== to
      ? `Le rôle actif a changé en cours de conversation : de « ${from} » à « ${to} ». `
        + `Les messages précédents ont été produits sous le rôle précédent ; adopte « ${to} » pour la suite.`
      : `Le rôle actif est désormais « ${to} » (changement en cours de conversation).`;
  return `<system-reminder>${body}</system-reminder>`;
}

/**
 * Marqueur de changement d'effort de raisonnement « à chaud », transmis au modèle
 * (même logique que le switch de persona : appliqué en live au query SDK sans que
 * le modèle en garde trace, donc on l'informe au prochain tour user).
 */
export function buildEffortNote(from: string | undefined, to: string): string {
  const body =
    from && from !== to
      ? `L'effort de raisonnement a changé en cours de conversation : de « ${from} » à « ${to} ». `
        + `Adapte la profondeur de ton raisonnement en conséquence pour la suite.`
      : `L'effort de raisonnement est désormais « ${to} » (changement en cours de conversation).`;
  return `<system-reminder>${body}</system-reminder>`;
}

/**
 * Marqueur de changement de mode de permission « à chaud », transmis au modèle.
 */
export function buildModeNote(from: string | undefined, to: string): string {
  const body =
    from && from !== to
      ? `Le mode de permission a changé en cours de conversation : de « ${from} » à « ${to} ». `
        + `Tiens-en compte pour la suite (autorisations d'outils / d'édition).`
      : `Le mode de permission est désormais « ${to} » (changement en cours de conversation).`;
  return `<system-reminder>${body}</system-reminder>`;
}

/**
 * Préfixe le(s) marqueur(s) au texte envoyé au modèle. Le transcript/UI conserve,
 * lui, le texte brut : le marqueur ne fuit jamais côté affichage. Accepte plusieurs
 * notes (persona + effort + mode) : les valeurs vides sont ignorées, les autres
 * concaténées et séparées du texte par une ligne vide.
 */
export function applyPersonaNote(note: string | undefined, text: string): string {
  return note ? `${note}\n\n${text}` : text;
}

/** Assemble plusieurs notes en un seul bloc (vides ignorées) ou `undefined` si aucune. */
export function combineNotes(...notes: (string | undefined)[]): string | undefined {
  const kept = notes.filter((n): n is string => Boolean(n));
  return kept.length ? kept.join('\n') : undefined;
}
