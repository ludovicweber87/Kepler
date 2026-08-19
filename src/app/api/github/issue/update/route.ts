import { NextRequest, NextResponse } from 'next/server';
import { updateIssue } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function PATCH(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { owner, repo, number, title, body } = (await req.json()) as {
			owner: string;
			repo: string;
			number: number;
			title?: string;
			body?: string;
		};

		if (!owner || !repo || !number) {
			return NextResponse.json({ error: 'owner, repo and number required' }, { status: 400 });
		}

		const fields: { title?: string; body?: string } = {};
		if (title !== undefined) fields.title = title;
		if (body !== undefined) fields.body = body;

		if (Object.keys(fields).length === 0) {
			return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
		}

		await updateIssue(owner, repo, number, fields, auth.accessToken);

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
