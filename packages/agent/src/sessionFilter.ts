/** Préfixe des sessions tmux créées par l'app (voir `AgentTerminalModal`). */
export const SESSION_PREFIX = 'kepler-';

/**
 * Préfixes hérités de l'ancien nom du projet (Devora). Les sessions tmux déjà
 * vivantes et les `session_id` déjà en base les portent : on continue de les
 * reconnaître en lecture, sinon elles disparaîtraient de l'UI tout en tournant
 * encore — donc plus tuables depuis l'app. À supprimer une fois le parc migré.
 */
export const LEGACY_SESSION_PREFIXES = ['devora-'];

const SESSION_PREFIXES = [SESSION_PREFIX, ...LEGACY_SESSION_PREFIXES];

/**
 * Un terminal shell du Workbench est une session tmux nommée
 * `<sessionId>-shell-<tabId>` (ex. `-shell-1`) — ou `-shell` pour l'ancien
 * schéma mono-terminal. Ces sessions ne doivent jamais apparaître comme des
 * sessions d'agent : leur nom ne correspond à aucune ligne `agent_sessions`
 * ni à aucun transcript (clés sur l'ID nu).
 */
export function isShellTerminalSession(name: string): boolean {
	return /-shell(-\d+)?$/.test(name);
}

/** Vrai si le nom tmux est une session d'agent Kepler (et non un terminal shell). */
export function isAgentSession(name: string): boolean {
	return SESSION_PREFIXES.some((p) => name.startsWith(p)) && !isShellTerminalSession(name);
}

/** Retire le préfixe d'app — courant ou hérité — pour dériver un libellé lisible. */
export function stripSessionPrefix(sessionId: string): string {
	const prefix = SESSION_PREFIXES.find((p) => sessionId.startsWith(p));
	return prefix ? sessionId.slice(prefix.length) : sessionId;
}
