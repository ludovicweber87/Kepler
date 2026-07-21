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

/** Vrai si le nom tmux est une session d'agent Devora (et non un terminal shell). */
export function isAgentSession(name: string): boolean {
	return name.startsWith('devora-') && !isShellTerminalSession(name);
}
