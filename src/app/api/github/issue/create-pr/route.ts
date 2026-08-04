import { NextRequest, NextResponse } from 'next/server';
import { createPullRequest, fetchDefaultBranch } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { owner, repo, head, title, body } = (await req.json()) as {
			owner: string;
			repo: string;
			head: string;
			title: string;
			body: string;
		};

		if (!owner || !repo || !head || !title) {
			return NextResponse.json(
				{ error: 'owner, repo, head and title required' },
				{ status: 400 },
			);
		}

		const base = await fetchDefaultBranch(owner, repo, auth.accessToken);
		const pr = await createPullRequest(owner, repo, head, base, title, body ?? '', auth.accessToken);

		return NextResponse.json({ ok: true, html_url: pr.html_url, number: pr.number });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
