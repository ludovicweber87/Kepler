import { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readBody, sendJson, sendError } from '../helpers.js';
import { getDb } from '../db.js';
import {
	buildDocWriterSystemPrompt,
	buildDocBrief,
	buildRefinePrompt,
	toolPolicyFor,
	runDocWriterAgent,
	type DocBrief,
} from '../sdk/docWriter.js';

interface DocRow {
	id: string;
	title: string;
	subject: string;
	source_type: DocBrief['source_type'];
	repo_full_name: string | null;
	level: DocBrief['level'];
	length: DocBrief['length'];
	format: DocBrief['format'];
	angle: string | null;
	content: string | null;
	status: string;
	agent_session_id: string | null;
}

function loadDoc(docId: string): DocRow | null {
	const db = getDb();
	if (!db) return null;
	return (db.prepare('SELECT * FROM docs WHERE id = ?').get(docId) as DocRow | undefined) ?? null;
}

function repoLocalPath(repoFullName: string): string | null {
	const db = getDb();
	if (!db) return null;
	const row = db
		.prepare('SELECT local_path FROM repo_paths WHERE lower(repo_full_name) = lower(?)')
		.get(repoFullName) as { local_path?: string } | undefined;
	return row?.local_path ?? null;
}

/** Dossier de travail pour une doc « savoir général » : scratch dédié, sans code. */
function scratchDir(docId: string): string {
	const dir = join(tmpdir(), 'devora-docs', docId);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function setStatus(docId: string, status: string, error: string | null = null) {
	const db = getDb();
	if (!db) return;
	db.prepare(
		"UPDATE docs SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?",
	).run(status, error, docId);
}

function setContent(docId: string, content: string) {
	const db = getDb();
	if (!db) return;
	db.prepare(
		"UPDATE docs SET content = ?, status = 'ready', error = NULL, updated_at = datetime('now') WHERE id = ?",
	).run(content, docId);
}

/** Crée/rafraîchit la session agent (cachée) liée à une doc. */
function upsertDocSession(
	doc: DocRow,
	cwd: string,
	systemPrompt: string,
	claudeSessionId: string | null,
) {
	const db = getDb();
	if (!db) return null;
	const sessionId = doc.agent_session_id ?? `doc-${doc.id}`;
	const existing = db
		.prepare('SELECT id FROM agent_sessions WHERE session_id = ?')
		.get(sessionId) as { id: string } | undefined;
	if (existing) {
		if (claudeSessionId) {
			db.prepare('UPDATE agent_sessions SET claude_session_id = ? WHERE session_id = ?').run(
				claudeSessionId,
				sessionId,
			);
		}
	} else {
		db.prepare(
			`INSERT INTO agent_sessions (id, session_id, project_path, project_name, agent_name, status, system_prompt, origin, claude_session_id, started_at)
			 VALUES (?, ?, ?, ?, ?, 'ready', ?, 'doc', ?, datetime('now'))`,
		).run(randomUUID(), sessionId, cwd, doc.title, doc.title, systemPrompt, claudeSessionId);
	}
	db.prepare('UPDATE docs SET agent_session_id = ? WHERE id = ?').run(sessionId, doc.id);
	return sessionId;
}

function claudeSessionIdFor(sessionId: string): string | null {
	const db = getDb();
	if (!db) return null;
	const row = db
		.prepare('SELECT claude_session_id AS c FROM agent_sessions WHERE session_id = ?')
		.get(sessionId) as { c: string | null } | undefined;
	return row?.c ?? null;
}

function appendChat(sessionId: string, role: 'user' | 'assistant', kind: string, text: string) {
	const db = getDb();
	if (!db) return;
	const row = db
		.prepare(
			'SELECT COALESCE(MAX(seq), 0) AS m FROM agent_chat_messages WHERE agent_session_id = ?',
		)
		.get(sessionId) as { m: number };
	db.prepare(
		`INSERT INTO agent_chat_messages (id, agent_session_id, seq, role, event_type, content, created_at)
		 VALUES (?, ?, ?, ?, 'doc_refine', ?, datetime('now'))`,
	).run(randomUUID(), sessionId, (row.m ?? 0) + 1, role, JSON.stringify({ kind, text }));
}

function briefOf(doc: DocRow): DocBrief {
	return {
		subject: doc.subject,
		source_type: doc.source_type,
		repo_full_name: doc.repo_full_name,
		level: doc.level,
		length: doc.length,
		format: doc.format,
		angle: doc.angle,
	};
}

/** Génération initiale (async, non bloquante pour la réponse HTTP). */
async function generateDoc(docId: string): Promise<void> {
	const doc = loadDoc(docId);
	if (!doc) return;
	setStatus(docId, 'generating');
	try {
		const cwd =
			doc.source_type === 'repo' && doc.repo_full_name
				? (repoLocalPath(doc.repo_full_name) ?? scratchDir(docId))
				: scratchDir(docId);
		const systemPrompt = buildDocWriterSystemPrompt();
		const prompt = buildDocBrief(briefOf(doc));
		const { content, claudeSessionId } = await runDocWriterAgent({
			cwd,
			systemPrompt,
			prompt,
			allowedTools: toolPolicyFor(doc.source_type),
		});
		if (!content) throw new Error('empty generation');
		upsertDocSession(doc, cwd, systemPrompt, claudeSessionId);
		setContent(docId, content);
	} catch (err) {
		setStatus(docId, 'failed', err instanceof Error ? err.message : 'generation failed');
	}
}

/** Affinage : reprend la session SDK de la doc et réécrit le contenu. */
async function refineDoc(docId: string, instruction: string): Promise<void> {
	const doc = loadDoc(docId);
	if (!doc) return;
	const sessionId = doc.agent_session_id ?? `doc-${doc.id}`;
	appendChat(sessionId, 'user', 'instruction', instruction);
	setStatus(docId, 'generating');
	try {
		const cwd =
			doc.source_type === 'repo' && doc.repo_full_name
				? (repoLocalPath(doc.repo_full_name) ?? scratchDir(docId))
				: scratchDir(docId);
		const systemPrompt = buildDocWriterSystemPrompt();
		const prompt = buildRefinePrompt(instruction, doc.content ?? '');
		const { content, claudeSessionId } = await runDocWriterAgent({
			cwd,
			systemPrompt,
			prompt,
			allowedTools: toolPolicyFor(doc.source_type),
			resume: claudeSessionIdFor(sessionId),
		});
		if (!content) throw new Error('empty refinement');
		upsertDocSession(doc, cwd, systemPrompt, claudeSessionId);
		setContent(docId, content);
		appendChat(sessionId, 'assistant', 'ack', '');
	} catch (err) {
		setStatus(docId, 'failed', err instanceof Error ? err.message : 'refine failed');
		appendChat(sessionId, 'assistant', 'error', err instanceof Error ? err.message : 'error');
	}
}

function getChat(sessionId: string) {
	const db = getDb();
	if (!db) return [];
	const rows = db
		.prepare(
			"SELECT role, content, created_at FROM agent_chat_messages WHERE agent_session_id = ? AND event_type = 'doc_refine' ORDER BY seq ASC",
		)
		.all(sessionId) as Array<{ role: string; content: string; created_at: string }>;
	return rows.map((r) => {
		let parsed: { kind?: string; text?: string } = {};
		try {
			parsed = JSON.parse(r.content);
		} catch {
			/* ignore */
		}
		return {
			role: r.role,
			kind: parsed.kind ?? 'text',
			text: parsed.text ?? '',
			created_at: r.created_at,
		};
	});
}

export async function handleDocRoutes(req: IncomingMessage, res: ServerResponse, path: string) {
	const method = req.method ?? 'GET';

	if (path === '/docs/generate' && method === 'POST') {
		try {
			const { docId } = await readBody<{ docId?: string }>(req);
			if (!docId) return sendJson(res, { error: 'docId required' }, 400);
			if (!loadDoc(docId)) return sendJson(res, { error: 'doc not found' }, 404);
			// Fire-and-forget : on répond tout de suite, la génération continue en fond.
			void generateDoc(docId).catch((e) => console.error('[docs] generate', e));
			return sendJson(res, { ok: true, status: 'generating' }, 202);
		} catch (err) {
			return sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
	}

	if (path === '/docs/refine' && method === 'POST') {
		try {
			const { docId, instruction } = await readBody<{ docId?: string; instruction?: string }>(
				req,
			);
			if (!docId || !instruction?.trim())
				return sendJson(res, { error: 'docId and instruction required' }, 400);
			if (!loadDoc(docId)) return sendJson(res, { error: 'doc not found' }, 404);
			void refineDoc(docId, instruction.trim()).catch((e) =>
				console.error('[docs] refine', e),
			);
			return sendJson(res, { ok: true, status: 'generating' }, 202);
		} catch (err) {
			return sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
	}

	if (path === '/docs/chat' && method === 'GET') {
		try {
			const url = new URL(req.url ?? '', 'http://localhost');
			const docId = url.searchParams.get('docId');
			if (!docId) return sendJson(res, { error: 'docId required' }, 400);
			const doc = loadDoc(docId);
			const sessionId = doc?.agent_session_id ?? `doc-${docId}`;
			return sendJson(res, { messages: getChat(sessionId) });
		} catch (err) {
			return sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
	}

	sendJson(res, { error: 'Not found' }, 404);
}
