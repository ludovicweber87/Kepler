import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { findTmux } from './helpers.js';
import { SESSION_PREFIX } from './sessionFilter.js';

const TMUX = findTmux();

/**
 * Une session tmux d'agent traîne ses terminaux shell : `<id>-shell` (ancien
 * schéma) et `<id>-shell-<tabId>` (onglets du Workbench). Deviner les noms un
 * par un ne suffit pas — il faut partir de la liste réelle, sinon chaque onglet
 * ouvert survit à l'arrêt de la session et le serveur tmux enfle sans fin.
 */
export function tmuxNamesToKill(sessionId: string, allNames: string[]): string[] {
	return allNames.filter((name) => name === sessionId || name.startsWith(`${sessionId}-shell`));
}

/** Retire le suffixe d'onglet shell pour retrouver l'ID de session d'agent. */
export function baseSessionId(tmuxName: string): string {
	return tmuxName.replace(/-shell(-\d+)?$/, '');
}

export interface TmuxSessionSnapshot {
	name: string;
	createdAt: number;
}

/**
 * Sessions tmux à recycler : plus aucune ligne `agent_sessions` ne les revendique.
 * Le délai de grâce couvre la fenêtre entre `tmux new-session` et l'écriture de
 * la ligne en base — sans lui, le reaper tuerait une session en train de naître.
 */
export function selectOrphanTmuxSessions(
	snapshots: TmuxSessionSnapshot[],
	knownSessionIds: Set<string>,
	now: number,
	graceMs: number,
): string[] {
	return snapshots
		.filter((s) => s.name.startsWith(SESSION_PREFIX))
		.filter((s) => now - s.createdAt > graceMs)
		.filter((s) => !knownSessionIds.has(baseSessionId(s.name)))
		.map((s) => s.name);
}

/**
 * Sessions SDK dont le worktree a disparu sous les pieds : le process `claude`
 * tourne toujours (~400 Mo) sur un cwd qui n'existe plus. C'est le cas typique
 * après une suppression de worktree.
 */
export function selectDeadSdkSessions(
	active: { sessionId: string; cwd: string }[],
	dirExists: (path: string) => boolean = existsSync,
): string[] {
	return active.filter((s) => s.cwd && !dirExists(s.cwd)).map((s) => s.sessionId);
}

// ── Effets tmux ──

/** Toutes les sessions tmux existantes, avec leur date de création (ms). */
export function listTmuxSnapshots(): TmuxSessionSnapshot[] {
	try {
		const out = execFileSync(
			TMUX,
			['list-sessions', '-F', '#{session_name}|#{session_created}'],
			{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 },
		);
		return out
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const [name, created] = line.split('|');
				return { name, createdAt: parseInt(created, 10) * 1000 };
			});
	} catch {
		return [];
	}
}

/** `=` force la correspondance exacte : sans lui tmux tue par préfixe. */
export function killTmuxSession(name: string): void {
	try {
		execFileSync(TMUX, ['kill-session', '-t', `=${name}`], {
			stdio: 'ignore',
			timeout: 5000,
		});
	} catch {
		// déjà morte, ou serveur tmux absent
	}
}

/** Tue la session tmux d'un agent et tous ses onglets shell. */
export function killTmuxSessionsFor(sessionId: string): void {
	const names = tmuxNamesToKill(
		sessionId,
		listTmuxSnapshots().map((s) => s.name),
	);
	for (const name of names) killTmuxSession(name);
}
