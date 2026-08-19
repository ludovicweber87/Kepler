import { NextRequest, NextResponse } from 'next/server';
import { createIssueComment, updateIssueComment, deleteIssueComment } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

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

		await createIssueComment(owner, repo, issueNumber, body, auth.accessToken);

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { owner, repo, commentId, body } = (await req.json()) as {
			owner: string;
			repo: string;
			commentId: number;
			body: string;
		};

		if (!owner || !repo || !commentId || !body) {
			return NextResponse.json(
				{ error: 'owner, repo, commentId and body are required' },
				{ status: 400 },
			);
		}

		await updateIssueComment(owner, repo, commentId, body, auth.accessToken);

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function DELETE(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { owner, repo, commentId } = (await req.json()) as {
			owner: string;
			repo: string;
			commentId: number;
		};

		if (!owner || !repo || !commentId) {
			return NextResponse.json(
				{ error: 'owner, repo and commentId are required' },
				{ status: 400 },
			);
		}

		await deleteIssueComment(owner, repo, commentId, auth.accessToken);

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
