import { NextRequest, NextResponse } from 'next/server';
import { fetchMergedPrs } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const repo = req.nextUrl.searchParams.get('repo');
	if (!repo || !repo.includes('/')) {
		return NextResponse.json(
			{ error: 'repo parameter required (owner/name)' },
			{ status: 400 },
		);
	}

	try {
		const [owner, name] = repo.split('/');
		const mergedPrs = await fetchMergedPrs(owner, name, auth.accessToken);
		const branches = mergedPrs.map((pr) => pr.ref);
		return NextResponse.json({ branches, mergedPrs });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
