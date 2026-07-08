import { NextResponse } from 'next/server';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Resolve the gh binary absolutely — the server process may have a minimal PATH. */
function resolveGh(): string {
	for (const p of ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh']) {
		if (existsSync(p)) return p;
	}
	return 'gh';
}

export interface AuthContext {
	userId: string;
	login: string;
	accessToken: string;
}

// ── GitHub token: the local `gh` CLI session (fallback: GITHUB_TOKEN env) ──

const TOKEN_TTL = 60_000;
let tokenCache: { token: string; at: number } | null = null;

function readGhToken(): string | null {
	const now = Date.now();
	if (tokenCache && now - tokenCache.at < TOKEN_TTL) return tokenCache.token;

	// Prefer an injected token — the `devora` CLI reads gh in the user's session
	// and passes it via GITHUB_TOKEN, so the detached server never calls gh.
	const envToken = process.env.GITHUB_TOKEN?.trim();
	if (envToken) {
		tokenCache = { token: envToken, at: now };
		return envToken;
	}

	// Fallback (e.g. `npm run dev`): read the local gh session directly.
	try {
		const token = execFileSync(resolveGh(), ['auth', 'token'], {
			encoding: 'utf-8',
			timeout: 5000,
		}).trim();
		if (token) {
			tokenCache = { token, at: now };
			return token;
		}
	} catch {
		/* gh missing or not logged in */
	}
	return null;
}

// ── GitHub user (identity), resolved from the token and cached ──

interface GhUser {
	id: number;
	login: string;
	name?: string | null;
	avatar_url?: string | null;
}

const USER_TTL = 300_000;
let userCache: { token: string; user: GhUser; at: number } | null = null;

async function fetchGhUser(token: string): Promise<GhUser | null> {
	const now = Date.now();
	if (userCache && userCache.token === token && now - userCache.at < USER_TTL) {
		return userCache.user;
	}
	try {
		const res = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'User-Agent': 'devora',
			},
		});
		if (!res.ok) return null;
		const user = (await res.json()) as GhUser;
		userCache = { token, user, at: now };
		return user;
	} catch {
		return null;
	}
}

/** Auth context from the local gh session. Null if no usable token. */
export async function getAuthContext(): Promise<AuthContext | null> {
	const token = readGhToken();
	if (!token) return null;
	const user = await fetchGhUser(token);
	if (!user) return null;
	return { userId: String(user.id), login: user.login, accessToken: token };
}

/** Require a GitHub token for an API route. Returns the context or a 401. */
export async function requireAuth(): Promise<AuthContext | NextResponse> {
	const ctx = await getAuthContext();
	if (!ctx) {
		return NextResponse.json(
			{
				error: 'gh_not_authenticated',
				message: 'GitHub CLI not authenticated — run `gh auth login`.',
			},
			{ status: 401 },
		);
	}
	return ctx;
}

export function isAuthError(result: AuthContext | NextResponse): result is NextResponse {
	return result instanceof NextResponse;
}

/** Current user for the UI (login/avatar). Null if not authenticated. */
export async function getCurrentUser() {
	const token = readGhToken();
	if (!token) return null;
	const user = await fetchGhUser(token);
	if (!user) return null;
	return { login: user.login, name: user.name ?? null, avatarUrl: user.avatar_url ?? null };
}
