import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export interface AuthContext {
	userId: string;
	login: string;
	accessToken: string;
}

/**
 * Get authenticated user context from the session.
 * Returns null if not authenticated.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
	const session = await auth();
	if (!session?.user?.id || !session.accessToken) return null;

	return {
		userId: session.user.id,
		login: session.user.login,
		accessToken: session.accessToken,
	};
}

/**
 * Require authentication for an API route.
 * Returns the auth context or a 401 response.
 */
export async function requireAuth(): Promise<AuthContext | NextResponse> {
	const ctx = await getAuthContext();
	if (!ctx) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	return ctx;
}

/** Type guard to check if requireAuth returned an error response */
export function isAuthError(result: AuthContext | NextResponse): result is NextResponse {
	return result instanceof NextResponse;
}
