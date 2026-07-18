/**
 * Fetch wrapper for the local devora-agent (runs on localhost:4001).
 * Does NOT throw AuthError on 401 — the agent has no auth layer.
 * In dev mode, falls back to apiFetch if the agent is offline.
 */

let _token: string | null = null;

/** Called by AuthProvider / session logic to inject the GitHub token */
export function setLocalToken(token: string | null) {
	_token = token;
}

const AGENT_BASE_URL =
	typeof window !== 'undefined'
		? (process.env.NEXT_PUBLIC_AGENT_URL ?? 'http://localhost:4001')
		: 'http://localhost:4001';

export function getAgentBaseUrl(): string {
	return AGENT_BASE_URL;
}

export function getAgentWsUrl(): string {
	return AGENT_BASE_URL.replace(/^http/, 'ws');
}

export function getAgentHttpUrl(): string {
	return AGENT_BASE_URL;
}

export function getAgentSseUrl(): string {
	return AGENT_BASE_URL.replace(/\/$/, '') + '/notifications/stream';
}

/** Thrown when the devora-agent is unreachable (offline / wrong port / CORS). */
export class AgentOfflineError extends Error {
	constructor(public path: string) {
		super(
			`Serveur agent injoignable sur ${AGENT_BASE_URL}. Lance \`npm run dev\` pour le démarrer.`,
		);
		this.name = 'AgentOfflineError';
	}
}

export async function localFetch(path: string, init?: RequestInit): Promise<Response> {
	const headers = new Headers(init?.headers);
	if (_token) {
		headers.set('Authorization', `Bearer ${_token}`);
	}

	try {
		return await fetch(`${AGENT_BASE_URL}${path}`, {
			...init,
			headers,
		});
	} catch {
		// Agent unreachable. In dev, fall back only to Next.js routes that still exist.
		if (process.env.NODE_ENV === 'development') {
			const fallbackPath = mapToApiFallback(path);
			if (fallbackPath) {
				const { apiFetch } = await import('@/lib/api-fetch');
				return apiFetch(fallbackPath, init);
			}
		}
		// No valid fallback → surface a clear, typed error instead of a cryptic
		// network failure (or an HTML 404 that later crashes res.json()).
		throw new AgentOfflineError(path);
	}
}

/**
 * Map agent paths to their Next.js API equivalents for dev fallback.
 * Only /agent-sessions/* still has a Next.js route — git, sessions, chat,
 * agent-builder and filesystem all migrated to the agent and have no fallback.
 */
function mapToApiFallback(agentPath: string): string | null {
	if (agentPath.startsWith('/agent-sessions/')) return `/api${agentPath}`;
	return null;
}
