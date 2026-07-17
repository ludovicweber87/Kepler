import { IncomingMessage, ServerResponse } from 'node:http';
import { execSync, execFileSync } from 'node:child_process';
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { sendJson, parseQuery, readBody } from '../helpers.js';

const MAX_BYTES = 1024 * 1024; // 1 Mo

export async function handleFilesystemRoutes(
	req: IncomingMessage,
	res: ServerResponse,
	path: string,
) {
	const method = req.method ?? 'GET';

	// ── Pick directory (macOS) ──

	if (path === '/filesystem/pick-directory' && method === 'GET') {
		try {
			const result = execSync(
				`osascript -e 'POSIX path of (choose folder with prompt "Select repository directory")'`,
				{ encoding: 'utf-8', timeout: 60000 },
			).trim();

			const dirPath = result.endsWith('/') ? result.slice(0, -1) : result;
			sendJson(res, { path: dirPath });
		} catch {
			sendJson(res, { path: null });
		}
		return;
	}

	// ── Read a file's raw content (bounded to MAX_BYTES) ──

	if (path === '/filesystem/read-file' && method === 'GET') {
		const q = parseQuery(req);
		const filePath = q.get('path') ?? '';
		const cwd = q.get('cwd') ?? '';
		if (!filePath) {
			sendJson(res, { error: 'path required' }, 400);
			return;
		}
		const abs = isAbsolute(filePath) ? filePath : join(cwd, filePath);
		try {
			const st = statSync(abs);
			if (!st.isFile()) {
				sendJson(res, { error: 'not a file' }, 400);
				return;
			}
			const truncated = st.size > MAX_BYTES;
			const len = truncated ? MAX_BYTES : st.size;
			const buf = Buffer.alloc(len);
			if (len > 0) {
				const fd = openSync(abs, 'r');
				try {
					readSync(fd, buf, 0, len, 0);
				} finally {
					closeSync(fd);
				}
			}
			sendJson(res, { content: buf.toString('utf-8'), truncated, path: abs });
		} catch (err) {
			sendJson(res, { error: err instanceof Error ? err.message : 'read failed' }, 404);
		}
		return;
	}

	// ── Open a path in a desktop editor (macOS `open -a`) ──

	if (path === '/filesystem/open-in-editor' && method === 'POST') {
		let body: { app?: string; path?: string };
		try {
			body = await readBody(req);
		} catch {
			sendJson(res, { error: 'invalid body' }, 400);
			return;
		}
		const app = (body.app ?? '').trim();
		const target = (body.path ?? '').trim();
		if (!app || !target || !isAbsolute(target)) {
			sendJson(res, { error: 'app and absolute path required' }, 400);
			return;
		}
		try {
			const st = statSync(target);
			if (!st.isDirectory() && !st.isFile()) {
				sendJson(res, { error: 'path not found' }, 404);
				return;
			}
		} catch {
			sendJson(res, { error: 'path not found' }, 404);
			return;
		}
		try {
			// execFile (no shell) → app/target are args, not interpolated into a command.
			execFileSync('open', ['-a', app, target], { timeout: 15000 });
			sendJson(res, { ok: true });
		} catch {
			// `open -a` exits non-zero when the application bundle is not installed.
			sendJson(res, { error: 'editor not found', code: 'editor_not_found' }, 404);
		}
		return;
	}

	sendJson(res, { error: 'Not found' }, 404);
}
