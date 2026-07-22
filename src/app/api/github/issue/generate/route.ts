import { NextRequest, NextResponse } from 'next/server';
import { generateIssueContent } from '@/lib/generateIssueContent';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

interface GenerateIssueBody {
	description: string;
	repo?: string;
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { description, repo } = (await req.json()) as GenerateIssueBody;

		if (!description?.trim()) {
			return NextResponse.json({ error: 'description is required' }, { status: 400 });
		}

		const generated = await generateIssueContent(description.trim(), repo);
		return NextResponse.json(generated);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
