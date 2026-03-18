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
	} catch (err) {
		// In development, fallback to Next.js API routes if agent is offline
		if (process.env.NODE_ENV === 'development') {
			const fallbackPath = mapToApiFallback(path);
			if (fallbackPath) {
				const { apiFetch } = await import('@/lib/api-fetch');
				return apiFetch(fallbackPath, init);
			}
		}
		throw err;
	}
}

/**
 * Map agent paths to their Next.js API equivalents for dev fallback.
 */
function mapToApiFallback(agentPath: string): string | null {
	// /git/* → /api/git/*
	if (agentPath.startsWith('/git/')) return `/api${agentPath}`;
	// /sessions → /api/sessions
	if (agentPath === '/sessions') return '/api/sessions';
	// /agent-sessions/* → /api/agent-sessions/*
	if (agentPath.startsWith('/agent-sessions/')) return `/api${agentPath}`;
	// /chat → /api/chat
	if (agentPath === '/chat') return '/api/chat';
	// /agent-builder → /api/agent-builder
	if (agentPath === '/agent-builder') return '/api/agent-builder';
	// /filesystem/* → /api/filesystem/*
	if (agentPath.startsWith('/filesystem/')) return `/api${agentPath}`;
	return null;
}
