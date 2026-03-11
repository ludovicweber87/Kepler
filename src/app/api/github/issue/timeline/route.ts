import { NextRequest, NextResponse } from 'next/server';
import { fetchIssueTimeline } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = request.nextUrl;
	const owner = searchParams.get('owner');
	const repo = searchParams.get('repo');
	const number = searchParams.get('number');

	if (!owner || !repo || !number) {
		return NextResponse.json({ error: 'Missing owner, repo, or number' }, { status: 400 });
	}

	const num = parseInt(number, 10);

	try {
		const events = await fetchIssueTimeline(owner, repo, num, auth.accessToken);
		return NextResponse.json({ events });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
