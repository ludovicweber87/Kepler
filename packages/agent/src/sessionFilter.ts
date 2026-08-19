/** Préfixe des sessions tmux créées par l'app (voir `AgentTerminalModal`). */
export const SESSION_PREFIX = 'kepler-';

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
	return name.startsWith(SESSION_PREFIX) && !isShellTerminalSession(name);
}

/** Retire le préfixe d'app pour dériver un libellé lisible. */
export function stripSessionPrefix(sessionId: string): string {
	return sessionId.startsWith(SESSION_PREFIX) ? sessionId.slice(SESSION_PREFIX.length) : sessionId;
}
