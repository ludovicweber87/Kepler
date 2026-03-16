import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { supabase } from '@/lib/supabase';

export interface AgentSummary {
	session_id: string;
	agent_name: string | null;
	project_name: string;
	project_path: string;
	branch: string | null;
	status: 'active' | 'completed' | 'error';
	started_at: string;
	ended_at: string | null;
	/** The summary log content (markdown) */
	summary: string | null;
	/** Title log content */
	title: string | null;
	/** Timestamp of the summary log */
	summary_at: string | null;
}

async function fetchAgentSummaries(userId: string): Promise<AgentSummary[]> {
	// Fetch recent sessions (completed or error, last 50)
	const { data: sessions, error: sessErr } = await supabase
		.from('agent_sessions')
		.select('*')
		.eq('user_id', userId)
		.in('status', ['completed', 'error'])
		.order('started_at', { ascending: false })
		.limit(50);

	if (sessErr) throw sessErr;
	if (!sessions || sessions.length === 0) return [];

	// Fetch ALL logs for those sessions (not just summary/title)
	const sessionIds = sessions.map((s) => s.id);
	const { data: logs, error: logErr } = await supabase
		.from('agent_activity_logs')
		.select('agent_session_id, content, log_type, created_at')
		.in('agent_session_id', sessionIds)
		.order('created_at', { ascending: true });

	if (logErr) throw logErr;

	// Index logs by session id
	const LOG_TYPE_ICON: Record<string, string> = {
		commit: '📦',
		file_change: '📝',
		error: '❌',
		info: 'ℹ️',
		ask_question: '❓',
	};

	const summaryMap = new Map<string, { summary: string | null; title: string | null; summary_at: string | null }>();
	const allLogsMap = new Map<string, Array<{ content: string; log_type: string; created_at: string }>>();

	for (const log of logs ?? []) {
		// Collect summary/title
		const existing = summaryMap.get(log.agent_session_id) ?? { summary: null, title: null, summary_at: null };
		if (log.log_type === 'summary' && !existing.summary) {
			existing.summary = log.content;
			existing.summary_at = log.created_at;
		}
		if (log.log_type === 'title' && !existing.title) {
			existing.title = log.content;
		}
		summaryMap.set(log.agent_session_id, existing);

		// Collect all non-summary logs for fallback
		if (log.log_type !== 'summary' && log.log_type !== 'title') {
			const arr = allLogsMap.get(log.agent_session_id) ?? [];
			arr.push(log);
			allLogsMap.set(log.agent_session_id, arr);
		}
	}

	return sessions.map((s) => {
		const logData = summaryMap.get(s.id);
		let summary = logData?.summary ?? null;

		// Fallback: build summary from activity logs if no dedicated summary exists
		if (!summary) {
			const activityLogs = allLogsMap.get(s.id);
			if (activityLogs && activityLogs.length > 0) {
				summary = activityLogs
					.map((l) => `- ${LOG_TYPE_ICON[l.log_type] ?? '•'} ${l.content}`)
					.join('\n');
			}
		}

		return {
			session_id: s.session_id,
			agent_name: s.agent_name,
			project_name: s.project_name,
			project_path: s.project_path,
			branch: s.branch,
			status: s.status,
			started_at: s.started_at,
			ended_at: s.ended_at,
			summary,
			title: logData?.title ?? null,
			summary_at: logData?.summary_at ?? null,
		};
	});
}

export function useAgentSummaries() {
	const { data: session } = useSession();
	const userId = session?.user?.id ?? null;

	return useQuery({
		queryKey: ['agent-summaries'],
		queryFn: () => fetchAgentSummaries(userId!),
		enabled: !!userId,
		refetchInterval: 15_000,
	});
}
