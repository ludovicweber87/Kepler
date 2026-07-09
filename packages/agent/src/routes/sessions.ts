import { IncomingMessage, ServerResponse } from 'node:http';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readBody, sendJson, sendError, findTmux, findClaude } from '../helpers.js';
import { getActiveSessions, sdkAgent } from '../terminal.js';
import { getDb } from '../db.js';

const TMUX = findTmux();

// ── Active session types ──

export interface ActiveSession {
	sessionId: string;
	cwd: string;
	branch: string | null;
	projectName: string;
	agentName: string | null;
	createdAt: number;
	lastActivity: number;
	lastOutput: number;
	isActive: boolean;
	isStreaming: boolean;
}

function getGitBranch(cwd: string): string | null {
	if (!cwd) return null;
	try {
		return execSync('git rev-parse --abbrev-ref HEAD', {
			cwd,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return null;
	}
}

function branchToLabel(branch: string): string {
	return branch
		.replace(/^(feat|fix|refactor|docs|chore|test|perf)\//, '$1 ')
		.replace(/[-_/]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveAgentName(sessionId: string, branch: string | null): string | null {
	if (branch && branch !== 'main' && branch !== 'master') {
		return branchToLabel(branch);
	}
	const base = sessionId.replace('devora-', '');
	const parts = base.split('-');
	const last = parts[parts.length - 1];
	// Detect uid suffixes: pure digits OR base36-like alphanumeric (6+ chars)
	if (/^\d+$/.test(last) || /^[a-z0-9]{6,}$/i.test(last)) return null;
	return last === 'session' ? null : last;
}

interface DbSession {
	session_id: string;
	branch: string | null;
	agent_name: string | null;
}

// ── Router ──

export async function handleSessionRoutes(
	req: IncomingMessage,
	res: ServerResponse,
	path: string,
) {
	const method = req.method ?? 'GET';

	// GET /sessions
	if (path === '/sessions' && method === 'GET') {
		try {
			const db = getDb();
			const metas = getActiveSessions();
			const sessionIds = metas.map((m) => m.sessionId);

			const dbMap = new Map<string, DbSession>();
			if (db && sessionIds.length > 0) {
				const placeholders = sessionIds.map(() => '?').join(',');
				const rows = db
					.prepare(
						`SELECT session_id, branch, agent_name FROM agent_sessions WHERE session_id IN (${placeholders})`,
					)
					.all(...sessionIds) as DbSession[];
				for (const row of rows) {
					dbMap.set(row.session_id, row);
				}
			}

			const toBackfill: { sessionId: string; branch: string }[] = [];

			const sessions: ActiveSession[] = metas.map((meta) => {
				const db = dbMap.get(meta.sessionId);
				let branch = db?.branch ?? null;

				if (!branch) {
					const gitBranch = getGitBranch(meta.cwd);
					if (gitBranch && gitBranch !== 'main' && gitBranch !== 'master') {
						branch = gitBranch;
						toBackfill.push({ sessionId: meta.sessionId, branch: gitBranch });
					}
				}

				return {
					sessionId: meta.sessionId,
					cwd: meta.cwd,
					branch,
					projectName: meta.cwd.split('/').filter(Boolean).pop() ?? 'unknown',
					agentName: db?.agent_name ?? deriveAgentName(meta.sessionId, branch),
					createdAt: meta.createdAt,
					lastActivity: meta.lastActivity,
					lastOutput: meta.lastOutput,
					isActive: true,
					isStreaming: meta.hasRecentOutput,
				};
			});

			// Persist branch snapshots
			if (db && toBackfill.length > 0) {
				const stmt = db.prepare(
					'UPDATE agent_sessions SET branch = ? WHERE session_id = ? AND branch IS NULL',
				);
				for (const { sessionId, branch } of toBackfill) {
					stmt.run(branch, sessionId);
				}
			}

			sessions.sort((a, b) => b.createdAt - a.createdAt);
			sendJson(res, { sessions });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}

	// POST /agent-sessions/:sessionId/kill
	const killMatch = path.match(/^\/agent-sessions\/([^/]+)\/kill$/);
	if (killMatch && method === 'POST') {
		const sessionId = decodeURIComponent(killMatch[1]);

		try {
			// Arrête la session SDK (chat modal) si présente en mémoire.
			sdkAgent.stop(sessionId);
			try {
				execSync(`${TMUX} kill-session -t ${sessionId}-shell`, { stdio: 'ignore' });
			} catch {
				// shell may not exist
			}
			try {
				execSync(`${TMUX} kill-session -t ${sessionId}`, { stdio: 'ignore' });
			} catch {
				// session may be dead
			}

			const db = getDb();
			if (db) {
				db.prepare(
					'UPDATE agent_sessions SET status = ?, ended_at = ? WHERE session_id = ?',
				).run('completed', new Date().toISOString(), sessionId);
			}

			sendJson(res, { ok: true });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}

	// POST /agent-sessions/:sessionId/auto-summary
	const summaryMatch = path.match(/^\/agent-sessions\/([^/]+)\/auto-summary$/);
	if (summaryMatch && method === 'POST') {
		const sessionId = decodeURIComponent(summaryMatch[1]);

		try {
			const { paneContent } = await readBody<{ paneContent: string }>(req);
			if (!paneContent) return sendJson(res, { error: 'paneContent required' }, 400);

			const db = getDb();
			if (!db) return sendError(res, 'Database not available', 500);

			const session = db
				.prepare(
					'SELECT id, session_id, project_name, agent_name, issue_owner, issue_repo, issue_number, issue_title FROM agent_sessions WHERE session_id = ?',
				)
				.get(sessionId) as { id: string } | undefined;

			if (!session) return sendJson(res, { error: 'Session not found' }, 404);

			const existingSummary = db
				.prepare(
					"SELECT id FROM agent_activity_logs WHERE agent_session_id = ? AND log_type = 'summary' LIMIT 1",
				)
				.get(session.id);

			if (existingSummary) return sendJson(res, { ok: true, skipped: true });

			const truncated = paneContent.slice(-8000);

			const prompt = `Analyse cette session de terminal d'un agent Claude et produis un rapport structuré en français. Réponds UNIQUEMENT avec le rapport, rien d'autre.

Format attendu :
## Ce qui a été fait
- (liste les actions concrètes réalisées)

## Fichiers modifiés
- \`path/to/file.ts\` : description courte du changement
(si tu ne peux pas identifier les fichiers, omets cette section)

## Décisions techniques
- (choix d'implémentation ou d'architecture notables, si applicable)

## Reste à faire
- (ce qui manque ou nécessite une review, si applicable — sinon "Rien")

---
${truncated}`;
			const escaped = prompt.replace(/'/g, "'\\''");
			const CLAUDE_BIN = findClaude();

			const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env as Record<
				string,
				string | undefined
			>;
			const summary = execSync(`${CLAUDE_BIN} --print '${escaped}'`, {
				encoding: 'utf-8',
				timeout: 30_000,
				maxBuffer: 1024 * 1024,
				env: cleanEnv as NodeJS.ProcessEnv,
			}).trim();

			if (!summary) return sendError(res, 'Empty summary');

			db.prepare(
				'INSERT INTO agent_activity_logs (id, agent_session_id, content, log_type) VALUES (?, ?, ?, ?)',
			).run(randomUUID(), session.id, summary, 'summary');

			sendJson(res, { ok: true });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}

	sendJson(res, { error: 'Not found' }, 404);
}
