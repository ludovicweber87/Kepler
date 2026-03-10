import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const {
			sessionId,
			content,
			logType = 'summary',
			branch,
			status,
		} = body as {
			sessionId: string;
			content: string;
			logType?: string;
			branch?: string;
			status?: string;
		};

		if (!sessionId || !content) {
			return NextResponse.json({ error: 'sessionId and content required' }, { status: 400 });
		}

		// Look up existing session — never create one here (ensureSession in the UI is the only creator)
		const { data: session } = await supabase
			.from('agent_sessions')
			.select('id')
			.eq('session_id', sessionId)
			.single();

		if (!session) {
			// Session not yet created by UI — silently skip (agent logs before modal opens)
			return NextResponse.json({ ok: true, skipped: true });
		}

		// Update branch and status if provided (status "active" is ignored — only reopen flow can set it)
		const updates: Record<string, unknown> = {};
		if (branch) updates.branch = branch;
		if (status && status !== 'active') {
			updates.status = status;
			if (status === 'completed' || status === 'error') {
				updates.ended_at = new Date().toISOString();
			}
		}
		if (Object.keys(updates).length > 0) {
			await supabase.from('agent_sessions').update(updates).eq('id', session.id);
		}

		// Insert activity log
		const { error: logError } = await supabase.from('agent_activity_logs').insert({
			agent_session_id: session.id,
			content,
			log_type: logType,
		});

		if (logError) {
			return NextResponse.json({ error: logError.message }, { status: 500 });
		}

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
