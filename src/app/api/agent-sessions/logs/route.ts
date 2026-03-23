import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { agentActivityLogs } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { searchParams } = req.nextUrl;
		const sessionId = searchParams.get('sessionId');

		if (!sessionId) {
			return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
		}

		const rows = db
			.select()
			.from(agentActivityLogs)
			.where(eq(agentActivityLogs.agent_session_id, sessionId))
			.orderBy(asc(agentActivityLogs.created_at))
			.all();

		return NextResponse.json(rows);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { agent_session_id, content, log_type = 'info' } = await req.json();

		if (!agent_session_id || !content) {
			return NextResponse.json({ error: 'agent_session_id and content required' }, { status: 400 });
		}

		const [row] = db
			.insert(agentActivityLogs)
			.values({ agent_session_id, content, log_type })
			.returning()
			.all();

		return NextResponse.json(row);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
