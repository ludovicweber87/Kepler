import { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readBody, sendJson, sendError, NOW_ISO } from '../helpers.js';
import { getDb } from '../db.js';
import {
	buildDocWriterSystemPrompt,
	buildDocBrief,
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
		`UPDATE docs SET status = ?, error = ?, updated_at = ${NOW_ISO} WHERE id = ?`,
	).run(status, error, docId);
}

function setContent(docId: string, content: string) {
	const db = getDb();
	if (!db) return;
	db.prepare(
		`UPDATE docs SET content = ?, status = 'ready', error = NULL, updated_at = ${NOW_ISO} WHERE id = ?`,
	).run(content, docId);
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
		const content = await runDocWriterAgent({
			cwd,
			systemPrompt: buildDocWriterSystemPrompt(),
			prompt: buildDocBrief(briefOf(doc)),
			allowedTools: toolPolicyFor(doc.source_type),
		});
		if (!content) throw new Error('empty generation');
		setContent(docId, content);
	} catch (err) {
		setStatus(docId, 'failed', err instanceof Error ? err.message : 'generation failed');
	}
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

	sendJson(res, { error: 'Not found' }, 404);
}
