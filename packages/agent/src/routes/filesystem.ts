import { IncomingMessage, ServerResponse } from 'node:http';
import { execSync } from 'node:child_process';
import { sendJson } from '../helpers.js';

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

	sendJson(res, { error: 'Not found' }, 404);
}
