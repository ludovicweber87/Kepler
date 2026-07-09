import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { agentSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { renameBranchFromText } from '@/lib/autoRenameBranch';

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { sessionId, prompt } = (await req.json()) as {
			sessionId?: string;
			prompt?: string;
		};

		if (!sessionId || !prompt) {
			return NextResponse.json({ error: 'sessionId and prompt required' }, { status: 400 });
		}

		const session = db
			.select({
				id: agentSessions.id,
				branch: agentSessions.branch,
				worktree_path: agentSessions.worktree_path,
			})
			.from(agentSessions)
			.where(eq(agentSessions.session_id, sessionId))
			.get();

		if (!session) {
			return NextResponse.json({ ok: true, skipped: true });
		}

		const branch = await renameBranchFromText(session, prompt);
		return NextResponse.json({ ok: true, branch });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
