import { NextRequest, NextResponse } from 'next/server';
import { mergePullRequest } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { repo, pull_number } = await req.json();

		if (!repo || !pull_number) {
			return NextResponse.json(
				{ error: 'repo and pull_number required' },
				{ status: 400 },
			);
		}

		const [owner, name] = repo.split('/');
		const result = await mergePullRequest(owner, name, pull_number, auth.accessToken);

		return NextResponse.json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
