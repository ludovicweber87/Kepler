import { NextRequest, NextResponse } from 'next/server';
import { fetchMergedBranchRefs } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const repo = req.nextUrl.searchParams.get('repo');
	if (!repo || !repo.includes('/')) {
		return NextResponse.json({ error: 'repo parameter required (owner/name)' }, { status: 400 });
	}

	try {
		const [owner, name] = repo.split('/');
		const branches = await fetchMergedBranchRefs(owner, name, auth.accessToken);
		return NextResponse.json({ branches });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
