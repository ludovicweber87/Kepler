import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

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

const LOG_TYPE_ICON: Record<string, string> = {
	commit: '📦',
	file_change: '📝',
	error: '❌',
	info: 'ℹ️',
	ask_question: '❓',
};

interface SessionWithLogs {
	id: string;
	session_id: string;
	agent_name: string | null;
	project_name: string;
	project_path: string;
	branch: string | null;
	status: string;
	started_at: string;
	ended_at: string | null;
	logs: Array<{ agent_session_id: string; content: string; log_type: string; created_at: string }>;
}

async function fetchAgentSummaries(): Promise<AgentSummary[]> {
	const res = await apiFetch('/api/agent-sessions?status=completed&limit=50&withLogs=true');
	if (!res.ok) throw new Error('Failed to fetch agent summaries');
	const sessions = (await res.json()) as SessionWithLogs[];

	if (!sessions || sessions.length === 0) return [];

	return sessions.map((s) => {
		const logs = s.logs ?? [];
		let summary: string | null = null;
		let title: string | null = null;
		let summary_at: string | null = null;
		const activityLogs: Array<{ content: string; log_type: string }> = [];

		for (const log of logs) {
			if (log.log_type === 'summary' && !summary) {
				summary = log.content;
				summary_at = log.created_at;
			}
			if (log.log_type === 'title' && !title) {
				title = log.content;
			}
			if (log.log_type !== 'summary' && log.log_type !== 'title') {
				activityLogs.push(log);
			}
		}

		// Fallback: build summary from activity logs
		if (!summary && activityLogs.length > 0) {
			summary = activityLogs
				.map((l) => `- ${LOG_TYPE_ICON[l.log_type] ?? '•'} ${l.content}`)
				.join('\n');
		}

		return {
			session_id: s.session_id,
			agent_name: s.agent_name,
			project_name: s.project_name,
			project_path: s.project_path,
			branch: s.branch,
			status: s.status as AgentSummary['status'],
			started_at: s.started_at,
			ended_at: s.ended_at,
			summary,
			title,
			summary_at,
		};
	});
}

export function useAgentSummaries() {
	return useQuery({
		queryKey: ['agent-summaries'],
		queryFn: fetchAgentSummaries,
		refetchInterval: 15_000,
	});
}
