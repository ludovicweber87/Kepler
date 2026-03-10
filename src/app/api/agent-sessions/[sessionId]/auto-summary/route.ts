import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { supabase } from '@/lib/supabase';

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	const { sessionId } = await params;

	try {
		const { paneContent } = (await req.json()) as { paneContent: string };

		if (!paneContent) {
			return NextResponse.json({ error: 'paneContent required' }, { status: 400 });
		}

		// Find the DB session
		const { data: session } = await supabase
			.from('agent_sessions')
			.select('id')
			.eq('session_id', sessionId)
			.maybeSingle();

		if (!session) {
			return NextResponse.json({ error: 'Session not found' }, { status: 404 });
		}

		// Check if a summary already exists (agent posted it itself)
		const { data: existingSummary } = await supabase
			.from('agent_activity_logs')
			.select('id')
			.eq('agent_session_id', session.id)
			.eq('log_type', 'summary')
			.limit(1)
			.maybeSingle();

		if (existingSummary) {
			return NextResponse.json({ ok: true, skipped: true });
		}

		// Truncate pane content to last ~8000 chars to stay within prompt limits
		const truncated = paneContent.slice(-8000);

		// Use claude CLI in --print mode (non-interactive, single response)
		const prompt = `Résume cette session de terminal d'un agent Claude en 3-5 bullet points concis en français. Ne réponds qu'avec les bullet points, rien d'autre.\n\n---\n${truncated}`;
		const escaped = prompt.replace(/'/g, "'\\''");

		const summary = execSync(`claude --print '${escaped}'`, {
			encoding: 'utf-8',
			timeout: 30_000,
			maxBuffer: 1024 * 1024,
		}).trim();

		if (!summary) {
			return NextResponse.json({ error: 'Empty summary' }, { status: 500 });
		}

		// Insert the auto-generated summary
		const { error: logError } = await supabase.from('agent_activity_logs').insert({
			agent_session_id: session.id,
			content: summary,
			log_type: 'summary',
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
