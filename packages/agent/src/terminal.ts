import { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, IPty } from 'node-pty';
import { execSync } from 'node:child_process';
import { findTmux } from './helpers.js';
import { getDb } from './db.js';

const TMUX = findTmux();

// ── Message types ──

interface InitMessage {
	type: 'init';
	sessionId: string;
	cwd: string;
	cols: number;
	rows: number;
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

type ClientMessage = InitMessage | InputMessage | ResizeMessage | ListSessionsMessage;

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
	try {
		const out = execSync(
			`${TMUX} list-sessions -F "#{session_name}|#{session_created}|#{pane_current_path}|#{session_activity}|#{pane_current_command}"`,
			{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] },
		);
		const now = Date.now();
		return out
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
		return [];
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
			.filter((s) => s.startsWith('devora-') && !s.endsWith('-shell'));
	} catch {
		return [];
	}
}

async function isSessionCompleted(sessionId: string): Promise<boolean> {
	try {
		const db = getDb();
		if (!db) return false;
		const row = db
			.prepare(
				"SELECT status FROM agent_sessions WHERE session_id = ? AND status IN ('completed', 'error') LIMIT 1",
			)
			.get(sessionId);
		return !!row;
	} catch {
		return false;
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

	wss.on('connection', (ws: WebSocket) => {
		let pty: IPty | null = null;
		let initReady: Promise<void> | null = null;

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

			if (msg.type === 'init') {
				initReady = (async () => {
					const attachId = msg.sessionId;
					const existed = tmuxSessionExists(msg.sessionId);
					const isShellSession = msg.sessionId.endsWith('-shell');

					if (!existed) {
						if (!isShellSession) {
							const completed = await isSessionCompleted(msg.sessionId);
							if (completed) {
								ws.send(
									JSON.stringify({
										type: 'init-error',
										reason: 'session_completed',
									}),
								);
								return;
							}
						}
						createTmuxSession(msg.sessionId, msg.cwd);
					}

					pty = spawnTmuxAttach(attachId, msg.cols, msg.rows);

					ws.send(
						JSON.stringify({
							type: 'init-ack',
							resumed: existed,
							...(attachId !== msg.sessionId ? { actualSessionId: attachId } : {}),
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
			if (pty) {
				pty.kill();
				pty = null;
			}
		});
	});
}
