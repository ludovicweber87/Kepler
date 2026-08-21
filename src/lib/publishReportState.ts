/**
 * Phase de publication du rapport, scopée à une session.
 *
 * `AgentActivityTab` n'est pas remonté d'une session à l'autre (le Workbench garde le
 * panneau droit en place et ne change que la prop `session`) : un `useState` local
 * affichait donc le spinner de la session en cours de publication sur le bouton de
 * l'issue suivante. Même pattern que `composerDraft` — store externe synchrone — mais
 * en mémoire seule : une publication en vol ne survit pas à un reload de page.
 */
export type PublishPhase = 'idle' | 'publishing' | 'synthesizing' | 'published';

const CHANGE_EVENT = 'kepler-publish-phase-change';

const phaseBySession = new Map<string, PublishPhase>();

function notify(): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** S'abonne aux changements de phase (pour `useSyncExternalStore`). */
export function subscribePublishPhase(callback: () => void): () => void {
	window.addEventListener(CHANGE_EVENT, callback);
	return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/** Phase de publication de la session, `'idle'` si aucune publication en cours. */
export function getPublishPhase(sessionId: string): PublishPhase {
	return phaseBySession.get(sessionId) ?? 'idle';
}

/**
 * Enregistre la phase d'une session. `'idle'` libère l'entrée : la map ne garde que les
 * sessions en cours de publication et celles publiées depuis l'ouverture de l'onglet.
 */
export function setPublishPhase(sessionId: string, phase: PublishPhase): void {
	if (getPublishPhase(sessionId) === phase) return;
	if (phase === 'idle') phaseBySession.delete(sessionId);
	else phaseBySession.set(sessionId, phase);
	notify();
}

/** Vrai tant que la publication de cette session est en vol (synthèse incluse). */
export function isPublishing(sessionId: string): boolean {
	const phase = getPublishPhase(sessionId);
	return phase === 'publishing' || phase === 'synthesizing';
}

/** Réinitialise le store — tests uniquement. */
export function resetPublishPhases(): void {
	phaseBySession.clear();
	notify();
}
