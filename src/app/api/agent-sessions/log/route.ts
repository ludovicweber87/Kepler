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
			.select('id, session_id, project_name, agent_name, issue_owner, issue_repo, issue_number, issue_title')
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

		// Create notification when agent posts a summary or session completes
		if (logType === 'summary' || (status === 'completed' || status === 'error')) {
			const isSummary = logType === 'summary';
			const isError = status === 'error' || logType === 'error';

			// Resolve view_name from repo
			let viewName: string | null = null;
			if (session.issue_owner && session.issue_repo) {
				const repoFull = `${session.issue_owner}/${session.issue_repo}`;
				const { data: configs } = await supabase
					.from('project_configs')
					.select('view_repo_mappings')
					.limit(1)
					.single();
				if (configs?.view_repo_mappings) {
					const mappings = configs.view_repo_mappings as Array<{
						viewName: string;
						repos?: string[];
						issues?: Array<{ repo: string; number: number }>;
					}>;
					const match = mappings.find(
						(m) =>
							m.repos?.includes(repoFull) ||
							m.issues?.some((i) => i.repo === repoFull && i.number === session.issue_number),
					);
					viewName = match?.viewName ?? null;
				}
			}

			const agentName = session.agent_name ?? 'Claude';
			const issueLabel = session.issue_title
				? `${session.issue_repo}#${session.issue_number} ${session.issue_title}`
				: session.project_name;

			const title = isError
				? `Erreur agent — ${issueLabel}`
				: isSummary
					? `Résumé disponible — ${issueLabel}`
					: `Session terminée — ${issueLabel}`;

			const message = isError
				? `L'agent ${agentName} a rencontré une erreur.`
				: isSummary
					? content.length > 200 ? content.slice(0, 200) + '…' : content
					: `L'agent ${agentName} a terminé sa session.`;

			await supabase.from('notifications').insert({
				type: isError ? 'agent_error' : isSummary ? 'agent_summary' : 'session_completed',
				title,
				message,
				issue_owner: session.issue_owner,
				issue_repo: session.issue_repo,
				issue_number: session.issue_number,
				issue_title: session.issue_title,
				session_id: session.session_id,
				view_name: viewName,
			});
		}

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
