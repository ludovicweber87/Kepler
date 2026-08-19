import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

// ── Env du sous-process Claude ──

/**
 * Variables retirées avant tout appel à Claude (SDK `query()` comme `claude
 * --print`) : le CLI/SDK s'authentifie via son login stocké, et laisser fuiter
 * `ANTHROPIC_*` du process serveur redirige l'auth/l'endpoint (proxy, token
 * incohérent) et casse silencieusement l'appel. Liste unique partagée pour
 * éviter que les deux chemins divergent à nouveau.
 */
export const CLAUDE_ENV_STRIP_KEYS = [
	'ANTHROPIC_API_KEY',
	'ANTHROPIC_AUTH_TOKEN',
	'ANTHROPIC_BASE_URL',
	'CLAUDECODE',
	'CLAUDE_CODE_ENTRYPOINT',
] as const;

/** Copie de `process.env` sans les variables qui parasitent l'auth Claude. */
export function cleanClaudeEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of CLAUDE_ENV_STRIP_KEYS) delete env[key];
	return env;
}

// ── Binary locators ──

export function findClaude(): string {
	const paths = [
		join(homedir(), '.local/bin/claude'),
		'/opt/homebrew/bin/claude',
		'/usr/local/bin/claude',
		'/usr/bin/claude',
	];
	for (const p of paths) {
		try {
			execSync(`test -x ${p}`, { stdio: 'ignore' });
			return p;
		} catch {
			/* continue */
		}
	}
	// Fall back to PATH resolution, then the bare name.
	try {
		const resolved = execSync('command -v claude', { encoding: 'utf-8' }).trim();
		if (resolved) return resolved;
	} catch {
		/* continue */
	}
	return 'claude';
}

export function findGh(): string {
	const paths = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'];
	for (const p of paths) {
		try {
			execSync(`test -x ${p}`, { stdio: 'ignore' });
			return p;
		} catch {
			/* continue */
		}
	}
	try {
		const resolved = execSync('command -v gh', { encoding: 'utf-8' }).trim();
		if (resolved) return resolved;
	} catch {
		/* continue */
	}
	return 'gh';
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

/**
 * Résout un token GitHub sans requête HTTP : session `gh` CLI, puis fallback `GITHUB_TOKEN`.
 * Utilisé par les callers qui n'ont pas de `req` (ex. le poller GitHub en arrière-plan).
 */
export function getLocalGithubToken(): string | null {
	try {
		const token = execFileSync(findGh(), ['auth', 'token'], {
			encoding: 'utf-8',
			timeout: 10000,
		}).trim();
		if (token) return token;
	} catch {
		/* gh absent ou non authentifié — on tente le fallback env */
	}
	return process.env.GITHUB_TOKEN ?? null;
}

export function resolveGitHubToken(req: IncomingMessage): string | null {
	const header = getToken(req);
	if (header) return header;
	return getLocalGithubToken();
}

/**
 * Horodatage SQL au format ISO 8601 UTC avec millisecondes — le seul format
 * écrit en base. `datetime('now')` produit de l'UTC sans marqueur de fuseau,
 * que JavaScript relit comme de l'heure locale. Le `%f` (et non `%S`) est
 * requis : mélanger les précisions casse le tri lexicographique.
 */
export const NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
