import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
	const supabase = createServiceRoleClient();
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

		// Look up existing session
		const { data: session } = await supabase
			.from('agent_sessions')
			.select('id, session_id, project_name, agent_name, issue_owner, issue_repo, issue_number, issue_title')
			.eq('session_id', sessionId)
			.single();

		if (!session) {
			return NextResponse.json({ ok: true, skipped: true });
		}

		// Handle "title" log type — update agent_name if not already set
		if (logType === 'title') {
			const title = content.slice(0, 60).trim();
			if (title) {
				await supabase
					.from('agent_sessions')
					.update({ agent_name: title })
					.eq('id', session.id)
					.is('agent_name', null);
			}
			return NextResponse.json({ ok: true });
		}

		// Insert activity log first (so the trigger can read it)
		const { error: logError } = await supabase.from('agent_activity_logs').insert({
			agent_session_id: session.id,
			content,
			log_type: logType,
		});

		if (logError) {
			return NextResponse.json({ error: logError.message }, { status: 500 });
		}

		// Update branch and status
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

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
