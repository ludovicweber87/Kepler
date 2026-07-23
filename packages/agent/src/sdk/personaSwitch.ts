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
 * Préfixe le marqueur au texte envoyé au modèle. Le transcript/UI conserve, lui,
 * le texte brut : le marqueur ne fuit jamais côté affichage.
 */
export function applyPersonaNote(note: string | undefined, text: string): string {
  return note ? `${note}\n\n${text}` : text;
}
