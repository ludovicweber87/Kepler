import { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, IPty } from 'node-pty';
import { execSync, execFile, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findTmux, findClaude, CLAUDE_ENV_STRIP_KEYS } from './helpers.js';
import { isAgentSession } from './sessionFilter.js';
import { createSdkAgentManager } from './sdk/sdkAgent.js';
import { buildDocStartParams } from './sdk/docSession.js';
import { getDb } from './db.js';
import {
	killTmuxSession,
	killTmuxSessionsFor,
	listTmuxSnapshots,
	selectDeadSdkSessions,
	selectOrphanTmuxSessions,
} from './sessionLifecycle.js';

// Manager de sessions Agent SDK, partagé par toutes les connexions WS.
export const sdkAgent = createSdkAgentManager();

const TMUX = findTmux();

// ── Message types ──

interface InitMessage {
	type: 'init';
	sessionId: string;
	cwd: string;
	cols: number;
	rows: number;
	/** When set on a brand-new session, launch the Claude CLI with this system prompt. */
	claudeSystemPrompt?: string;
}

interface InputMessage {
	type: 'input';
	data: string;
}

interface ResizeMessage {
	type: 'resize';
	cols: number;
	rows: number;
}

interface ListSessionsMessage {
	type: 'list-sessions';
}

interface KillMessage {
	type: 'kill';
	sessionId: string;
}

interface StreamInitMessage {
	type: 'stream-init';
	sessionId: string;
	/** Absent pour une session doc : le serveur résout le cwd depuis le docId. */
	cwd?: string;
	/** Session de chat sur une doc — tout est construit serveur (voir docSession.ts). */
	docId?: string;
	systemPrompt?: string;
	model?: string;
	effort?: string;
	permissionMode?: string;
	resumeClaudeSessionId?: string;
	retryLastUser?: boolean;
	observeOnly?: boolean;
	initialPrompt?: string;
}
interface StreamUserMessage {
	type: 'stream-user-message';
	sessionId: string;
	text: string;
	attachments?: { name: string; mediaType: string; data: string }[];
}
interface StreamSetModelMessage {
	type: 'stream-set-model';
	sessionId: string;
	model?: string;
}
interface StreamSetEffortMessage {
	type: 'stream-set-effort';
	sessionId: string;
	effort: string;
}
interface StreamSetModeMessage {
	type: 'stream-set-mode';
	sessionId: string;
	permissionMode: string;
}
interface StreamSetSystemPromptMessage {
	type: 'stream-set-system-prompt';
	sessionId: string;
	systemPrompt: string;
	personaName?: string;
}
interface StreamInterruptMessage {
	type: 'stream-interrupt';
	sessionId: string;
}
interface StreamStopMessage {
	type: 'stream-stop';
	sessionId: string;
}
interface StreamPermissionResponseMessage {
	type: 'stream-permission-response';
	sessionId: string;
	id: string;
	decision: 'allow-once' | 'allow-always' | 'reject';
}
interface StreamQuestionResponseMessage {
	type: 'stream-question-response';
	sessionId: string;
	id: string;
	answers: Record<string, string>;
}

type ClientMessage =
	| InitMessage
	| InputMessage
	| ResizeMessage
	| ListSessionsMessage
	| KillMessage
	| StreamInitMessage
	| StreamUserMessage
	| StreamSetModelMessage
	| StreamSetEffortMessage
	| StreamSetModeMessage
	| StreamSetSystemPromptMessage
	| StreamInterruptMessage
	| StreamStopMessage
	| StreamPermissionResponseMessage
	| StreamQuestionResponseMessage;

// Track last PTY output per session (sessionId → timestamp)
const sessionOutputTimestamps = new Map<string, number>();
// Track pane content hash for sessions not attached via WS
const sessionPaneHashes = new Map<string, string>();

function simpleHash(str: string): string {
	let h = 0;
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) - h + str.charCodeAt(i)) | 0;
	}
	return h.toString(36);
}

function capturePaneHash(sessionId: string): Promise<void> {
	return new Promise((resolve) => {
		execFile(
			TMUX,
			['capture-pane', '-t', `=${sessionId}`, '-p', '-J'],
			{ encoding: 'utf-8', timeout: 2000, maxBuffer: 1024 * 1024 },
			(err, stdout) => {
				if (err) return resolve();
				const hash = simpleHash(stdout);
				const prev = sessionPaneHashes.get(sessionId);
				sessionPaneHashes.set(sessionId, hash);
				if (prev !== undefined && prev !== hash) {
					sessionOutputTimestamps.set(sessionId, Date.now());
				}
				resolve();
			},
		);
	});
}

let paneRefreshInFlight = false;

/**
 * Rafraîchit les hashes de pane en tâche de fond. `getActiveSessions` ne lit
 * plus que le cache : un `capture-pane` **synchrone** par session (jusqu'à 2 s
 * chacun) gelait toute la boucle d'événements de l'agent à chaque poll — donc
 * tous les streams WS de tous les agents en même temps.
 */
function refreshPaneActivity(sessionIds: string[]): void {
	if (paneRefreshInFlight) return;
	const now = Date.now();
	// Une session dont le pty pousse déjà des données se signale toute seule.
	const stale = sessionIds.filter(
		(id) => now - (sessionOutputTimestamps.get(id) ?? 0) >= ACTIVE_THRESHOLD,
	);
	if (stale.length === 0) return;
	paneRefreshInFlight = true;
	void Promise.all(stale.map(capturePaneHash)).finally(() => {
		paneRefreshInFlight = false;
	});
}

export interface SessionMeta {
	sessionId: string;
	cwd: string;
	createdAt: number;
	lastActivity: number;
	lastOutput: number;
	command: string;
	hasRecentOutput: boolean;
}

const ACTIVE_THRESHOLD = 30_000;

export function getActiveSessions(): SessionMeta[] {
	let tmuxMetas: SessionMeta[] = [];
	try {
		const out = execSync(
			`${TMUX} list-sessions -F "#{session_name}|#{session_created}|#{pane_current_path}|#{session_activity}|#{pane_current_command}"`,
			{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] },
		);
		const now = Date.now();
		tmuxMetas = out
			.trim()
			.split('\n')
			.filter((line) => {
				const id = line.split('|')[0];
				return isAgentSession(id);
			})
			.map((line) => {
				const [sessionId, created, cwd, activity, command] = line.split('|');
				const tmuxActivity = parseInt(activity, 10) * 1000;
				const trackedTs = sessionOutputTimestamps.get(sessionId);
				const lastOutput = trackedTs ?? 0;
				const hasRecentOutput = lastOutput > 0 && now - lastOutput < ACTIVE_THRESHOLD;
				return {
					sessionId,
					cwd: cwd || '',
					createdAt: parseInt(created, 10) * 1000,
					lastActivity: tmuxActivity,
					lastOutput,
					command: command || '',
					hasRecentOutput,
				};
			});
	} catch {
		tmuxMetas = [];
	}

	// Le résultat de ce balayage sera lu au prochain poll : l'indicateur
	// d'activité a un tour de retard, au bénéfice d'un event loop jamais bloqué.
	refreshPaneActivity(tmuxMetas.map((m) => m.sessionId));

	// Fusionne les sessions SDK (chat modal) : elles n'ont pas de tmux et seraient
	// sinon classées "passées" alors qu'elles sont ouvertes.
	const now = Date.now();
	const tmuxIds = new Set(tmuxMetas.map((m) => m.sessionId));
	const sdkMetas: SessionMeta[] = sdkAgent
		.listActive()
		.filter((x) => !tmuxIds.has(x.sessionId))
		.map((x) => ({
			sessionId: x.sessionId,
			cwd: x.cwd || '',
			createdAt: x.createdAt,
			lastActivity: now,
			lastOutput: x.busy ? now : 0,
			command: 'claude',
			hasRecentOutput: x.busy,
		}));
	return [...tmuxMetas, ...sdkMetas];
}

/**
 * L'unique porte de sortie d'une session : process SDK `claude` (~400 Mo de RSS)
 * ET sessions tmux (agent + tous ses onglets shell). Tout chemin qui « ferme »
 * une session doit passer par ici. Ne tuer que tmux laissait le process SDK
 * tourner sur un worktree supprimé jusqu'à l'arrêt de l'agent : la machine
 * saturait à mesure que les sessions parallèles s'accumulaient.
 */
export function terminateSession(sessionId: string): void {
	sdkAgent.stop(sessionId);
	killTmuxSessionsFor(sessionId);
}

/** Fenêtre entre `tmux new-session` et l'écriture de la ligne `agent_sessions`. */
const REAP_GRACE_MS = 5 * 60_000;

/**
 * Filet de sécurité : rattrape ce qui a échappé à `terminateSession` — worktree
 * supprimé hors Kepler, ligne effacée à la main, Kepler tué de force (les
 * sessions tmux sont des daemons du serveur tmux, elles survivent à tout).
 */
export function reapOrphanSessions(): void {
	for (const sessionId of selectDeadSdkSessions(sdkAgent.listActive())) {
		console.log(`[kepler-agent] reaper: session SDK sur un cwd disparu → ${sessionId}`);
		terminateSession(sessionId);
	}

	// Sans base lisible on ne sait rien des sessions légitimes : on ne tue rien.
	const db = getDb();
	if (!db) return;
	try {
		const rows = db.prepare('SELECT session_id FROM agent_sessions').all() as {
			session_id: string;
		}[];
		const known = new Set(rows.map((r) => r.session_id));
		const orphans = selectOrphanTmuxSessions(
			listTmuxSnapshots(),
			known,
			Date.now(),
			REAP_GRACE_MS,
		);
		for (const name of orphans) {
			console.log(`[kepler-agent] reaper: session tmux sans ligne en base → ${name}`);
			killTmuxSession(name);
		}
	} catch (err) {
		console.error('[kepler-agent] reaper: balayage tmux échoué', err);
	}
}

function tmuxSessionExists(sessionId: string): boolean {
	try {
		execSync(`${TMUX} has-session -t ${sessionId}`, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

export function listTmuxSessions(): string[] {
	try {
		const out = execSync(`${TMUX} list-sessions -F "#{session_name}"`, {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'ignore'],
		});
		return out
			.trim()
			.split('\n')
			.filter((s) => isAgentSession(s));
	} catch {
		return [];
	}
}

function createTmuxSession(sessionId: string, cwd: string): void {
	execSync(`${TMUX} new-session -d -s ${sessionId} -x 120 -y 40 -c ${JSON.stringify(cwd)}`, {
		stdio: 'ignore',
	});
	execSync(`${TMUX} set-option -t ${sessionId} mouse on`, {
		stdio: 'ignore',
	});
}

/**
 * Launch the Claude CLI inside a freshly-created tmux session.
 * The system prompt is written to a temp file and passed via --system-prompt-file,
 * so no prompt content ever needs shell escaping. Args are passed to tmux as an
 * array (execFileSync), so the command string needs no outer-shell quoting either.
 */
function launchClaudeInSession(sessionId: string, systemPrompt: string): void {
	const promptFile = join(tmpdir(), `kepler-sysprompt-${sessionId}.md`);
	writeFileSync(promptFile, systemPrompt, 'utf-8');
	const claude = findClaude();
	// `$(...)`-free: the pane shell reads the file path literally. Le `unset` reprend
	// la liste partagée : sans lui, un ANTHROPIC_* de l'env détourne l'auth du CLI, et
	// CLAUDECODE ferait croire à Claude qu'il tourne dans une autre session Claude.
	const command = `unset ${CLAUDE_ENV_STRIP_KEYS.join(' ')} && ${claude} --system-prompt-file ${JSON.stringify(promptFile)}`;
	execFileSync(TMUX, ['send-keys', '-t', sessionId, command, 'Enter']);
}

function spawnTmuxAttach(sessionId: string, cols: number, rows: number): IPty {
	return spawn(TMUX, ['attach-session', '-t', sessionId], {
		name: 'xterm-256color',
		cols,
		rows,
		cwd: process.env.HOME || '/',
		env: {
			...process.env,
			TERM: 'xterm-256color',
			COLORTERM: 'truecolor',
		} as Record<string, string>,
	});
}

export function startTerminalServer(httpServer: HttpServer) {
	const wss = new WebSocketServer({ server: httpServer });
	console.log('[kepler-agent] WebSocket terminal server attached');

	// `ws` re-emits the HTTP server's 'error' onto the WSS. Without this handler
	// that re-emit throws (no listener) and preempts the server's own 'error'
	// handler — leaving the agent as a zombie on port conflicts.
	wss.on('error', (err) => {
		console.error('[kepler-agent] WebSocket server error:', err.message);
	});

	wss.on('connection', (ws: WebSocket) => {
		let pty: IPty | null = null;
		let initReady: Promise<void> | null = null;
		let streamSessionId: string | null = null;

		ws.on('message', async (raw: Buffer | string) => {
			let msg: ClientMessage;
			try {
				msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
			} catch {
				return;
			}

			if (msg.type === 'list-sessions') {
				const sessions = listTmuxSessions();
				ws.send(JSON.stringify({ type: 'sessions', sessions }));
				return;
			}

			if (msg.type === 'kill') {
				// Fermeture d'un onglet shell : correspondance exacte, sinon tmux
				// résout `-t` par préfixe et emporterait les onglets voisins.
				killTmuxSession(msg.sessionId);
				return;
			}

			if (msg.type === 'stream-init') {
				// Session doc : le client n'est cru sur rien. On recalcule le sessionId
				// depuis le docId et on construit prompt, outils, portail et périmètre
				// côté serveur — sinon les guardrails ne vaudraient rien.
				if (msg.docId) {
					const doc = buildDocStartParams(msg.docId);
					if (!doc) {
						ws.send(JSON.stringify({ type: 'stream-error', message: 'doc not found' }));
						return;
					}
					streamSessionId = doc.sessionId;
					sdkAgent.startOrAttach(doc.sessionId, ws, doc.params);
					return;
				}
				if (!msg.cwd) return;
				streamSessionId = msg.sessionId;
				sdkAgent.startOrAttach(msg.sessionId, ws, {
					cwd: msg.cwd,
					systemPrompt: msg.systemPrompt,
					model: msg.model,
					effort: msg.effort,
					permissionMode: msg.permissionMode,
					resumeClaudeSessionId: msg.resumeClaudeSessionId,
					retryLastUser: msg.retryLastUser,
					observeOnly: msg.observeOnly,
					initialPrompt: msg.initialPrompt,
				});
				return;
			}
			if (msg.type === 'stream-user-message') {
				sdkAgent.sendUserMessage(msg.sessionId, msg.text, msg.attachments);
				return;
			}
			if (msg.type === 'stream-set-model') {
				sdkAgent.setModel(msg.sessionId, msg.model);
				return;
			}
			if (msg.type === 'stream-set-effort') {
				sdkAgent.setEffort(msg.sessionId, msg.effort);
				return;
			}
			if (msg.type === 'stream-set-mode') {
				sdkAgent.setPermissionMode(msg.sessionId, msg.permissionMode);
				return;
			}
			if (msg.type === 'stream-set-system-prompt') {
				sdkAgent.setSystemPrompt(msg.sessionId, msg.systemPrompt, msg.personaName);
				return;
			}
			if (msg.type === 'stream-interrupt') {
				sdkAgent.interrupt(msg.sessionId);
				return;
			}
			if (msg.type === 'stream-stop') {
				sdkAgent.stop(msg.sessionId);
				return;
			}
			if (msg.type === 'stream-permission-response') {
				sdkAgent.resolvePermission(msg.sessionId, msg.id, msg.decision);
				return;
			}
			if (msg.type === 'stream-question-response') {
				sdkAgent.resolveQuestion(msg.sessionId, msg.id, msg.answers);
				return;
			}

			if (msg.type === 'init') {
				initReady = (async () => {
					try {
						const attachId = msg.sessionId;
						const existed = tmuxSessionExists(msg.sessionId);

						if (!existed) {
							// A session marked completed/error in the DB is only an
							// informational badge — it must NOT block reopening. The
							// tmux session is recreated so the user can resume work.
							// Closing a session for real is a manual action (kill).
							createTmuxSession(msg.sessionId, msg.cwd);
							// New session + a system prompt → launch Claude server-side,
							// before the client attaches (no timing race).
							if (msg.claudeSystemPrompt) {
								launchClaudeInSession(msg.sessionId, msg.claudeSystemPrompt);
							}
						}

						pty = spawnTmuxAttach(attachId, msg.cols, msg.rows);

						ws.send(
							JSON.stringify({
								type: 'init-ack',
								resumed: existed,
								...(attachId !== msg.sessionId
									? { actualSessionId: attachId }
									: {}),
							}),
						);

						pty.onData((data: string) => {
							sessionOutputTimestamps.set(attachId, Date.now());
							if (ws.readyState === WebSocket.OPEN) {
								ws.send(data);
							}
						});

						pty.onExit(() => {
							if (ws.readyState === WebSocket.OPEN) {
								ws.close();
							}
							pty = null;
						});
					} catch (err) {
						// A tmux/pty spawn failure must not crash the whole agent.
						console.error('[kepler-agent] Terminal init failed:', err);
						if (ws.readyState === WebSocket.OPEN) {
							ws.send(JSON.stringify({ type: 'init-error', reason: 'spawn_failed' }));
						}
					}
				})();
				return;
			}

			if (initReady) await initReady;

			if (msg.type === 'input' && pty) {
				pty.write(msg.data);
			}

			if (msg.type === 'resize' && pty) {
				pty.resize(msg.cols, msg.rows);
				try {
					execSync(`${TMUX} refresh-client -C ${msg.cols},${msg.rows}`, {
						stdio: 'ignore',
					});
				} catch {
					// ignore
				}
			}
		});

		ws.on('close', () => {
			if (streamSessionId) {
				sdkAgent.detach(streamSessionId, ws);
				streamSessionId = null;
			}
			if (pty) {
				pty.kill();
				pty = null;
			}
		});
	});
}
