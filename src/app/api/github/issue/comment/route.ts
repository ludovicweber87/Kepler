import { NextRequest, NextResponse } from 'next/server';
import { createIssueComment } from '@/lib/github';

export async function POST(req: NextRequest) {
	try {
		const { owner, repo, issueNumber, body } = (await req.json()) as {
			owner: string;
			repo: string;
			issueNumber: number;
			body: string;
		};

		if (!owner || !repo || !issueNumber || !body) {
			return NextResponse.json(
				{ error: 'owner, repo, issueNumber and body are required' },
				{ status: 400 },
			);
		}

		await createIssueComment(owner, repo, issueNumber, body);

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
