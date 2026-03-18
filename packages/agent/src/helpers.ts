import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { execSync } from 'node:child_process';

// ── Request helpers ──

export function parseQuery(req: IncomingMessage): URLSearchParams {
	const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
	return url.searchParams;
}

export function parsePath(req: IncomingMessage): string {
	const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
	return url.pathname;
}

export async function readBody<T = unknown>(req: IncomingMessage): Promise<T> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString()));
			} catch (err) {
				reject(err);
			}
		});
		req.on('error', reject);
	});
}

// ── Response helpers ──

export function sendJson(res: ServerResponse, data: unknown, status = 200) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

export function sendError(res: ServerResponse, message: string, status = 500) {
	sendJson(res, { error: message }, status);
}

export function sendSSE(res: ServerResponse, event: string, data: unknown) {
	res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function startSSE(res: ServerResponse) {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
	});
}

// ── Binary locators ──

export function findClaude(): string {
	const paths = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', '/usr/bin/claude'];
	for (const p of paths) {
		try {
			execSync(`test -x ${p}`, { stdio: 'ignore' });
			return p;
		} catch {
			/* continue */
		}
	}
	return 'claude';
}

export function findTmux(): string {
	const paths = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux'];
	for (const p of paths) {
		try {
			execSync(`test -x ${p}`, { stdio: 'ignore' });
			return p;
		} catch {
			/* continue */
		}
	}
	return 'tmux';
}

// ── Auth helper ──

export function getToken(req: IncomingMessage): string | null {
	const auth = req.headers.authorization;
	if (!auth?.startsWith('Bearer ')) return null;
	return auth.slice(7);
}
