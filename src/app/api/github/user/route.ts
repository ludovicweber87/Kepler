import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

// GET /api/github/user?login=<login> → { login, avatar_url } (200) | 404 | 400
export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const login = req.nextUrl.searchParams.get('login')?.trim();
	if (!login) {
		return NextResponse.json({ error: 'login required' }, { status: 400 });
	}

	try {
		const user = await fetchGitHubUser(login, auth.accessToken);
		if (!user) {
			return NextResponse.json({ error: 'not_found' }, { status: 404 });
		}
		return NextResponse.json(user);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
