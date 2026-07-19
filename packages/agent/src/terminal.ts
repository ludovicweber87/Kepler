import { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, IPty } from 'node-pty';
import { execSync, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findTmux, findClaude } from './helpers.js';
import { createSdkAgentManager } from './sdk/sdkAgent.js';

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
	cwd: string;
	systemPrompt?: string;
	model?: string;
	effort?: string;
	permissionMode?: string;
	resumeClaudeSessionId?: string;
	retryLastUser?: boolean;
	observeOnly?: boolean;
}
interface StreamUserMessage {
	type: 'stream-user-message';
	sessionId: string;
	text: string;
	images?: { name: string; mediaType: string; data: string }[];
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

function checkPaneActivity(sessionId: string): boolean {
	try {
		const content = execSync(`${TMUX} capture-pane -t ${sessionId} -p -J`, {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'ignore'],
			timeout: 2000,
		});
		const hash = simpleHash(content);
		const prev = sessionPaneHashes.get(sessionId);
		sessionPaneHashes.set(sessionId, hash);
		if (prev === undefined) return false;
		if (prev !== hash) {
			sessionOutputTimestamps.set(sessionId, Date.now());
			return true;
		}
		return false;
	} catch {
		return false;
	}
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
				return id.startsWith('devora-') && !id.endsWith('-shell');
			})
			.map((line) => {
				const [sessionId, created, cwd, activity, command] = line.split('|');
				const tmuxActivity = parseInt(activity, 10) * 1000;
				const trackedTs = sessionOutputTimestamps.get(sessionId);
				const lastOutput = trackedTs ?? 0;
				const paneChanged = checkPaneActivity(sessionId);
				const hasRecentOutput =
					(lastOutput > 0 && now - lastOutput < ACTIVE_THRESHOLD) || paneChanged;
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
			.filter((s) => s.startsWith('devora-') && !s.endsWith('-shell'));
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
	const promptFile = join(tmpdir(), `devora-sysprompt-${sessionId}.md`);
	writeFileSync(promptFile, systemPrompt, 'utf-8');
	const claude = findClaude();
	// `$(...)`-free: the pane shell reads the file path literally; unset avoids
	// Claude thinking it runs inside another Claude session.
	const command = `unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT && ${claude} --system-prompt-file ${JSON.stringify(promptFile)}`;
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
	console.log('[devora-agent] WebSocket terminal server attached');

	// `ws` re-emits the HTTP server's 'error' onto the WSS. Without this handler
	// that re-emit throws (no listener) and preempts the server's own 'error'
	// handler — leaving the agent as a zombie on port conflicts.
	wss.on('error', (err) => {
		console.error('[devora-agent] WebSocket server error:', err.message);
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
				try {
					if (tmuxSessionExists(msg.sessionId)) {
						execSync(`${TMUX} kill-session -t ${msg.sessionId}`, { stdio: 'ignore' });
					}
				} catch (err) {
					console.error('[devora-agent] kill-session failed:', err);
				}
				return;
			}

			if (msg.type === 'stream-init') {
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
				});
				return;
			}
			if (msg.type === 'stream-user-message') {
				sdkAgent.sendUserMessage(msg.sessionId, msg.text, msg.images);
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
						console.error('[devora-agent] Terminal init failed:', err);
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
