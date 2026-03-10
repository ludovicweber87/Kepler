import { NextRequest, NextResponse } from 'next/server';
import { createPullRequest } from '@/lib/github';

export async function POST(req: NextRequest) {
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

		const pr = await createPullRequest(owner, repo, head, 'main', title, body ?? '');

		return NextResponse.json({ ok: true, html_url: pr.html_url, number: pr.number });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
