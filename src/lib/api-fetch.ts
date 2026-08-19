export class AuthError extends Error {
	constructor() {
		super('Unauthorized');
		this.name = 'AuthError';
	}
}

/**
 * Fetch wrapper that throws AuthError on 401.
 * Used by client-side hooks to trigger global sign-out on session expiry.
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(url, init);
	if (res.status === 401) throw new AuthError();
	return res;
}
