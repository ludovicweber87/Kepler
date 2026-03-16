import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Returns a Set of worktree_path values where the agent's last log (excluding title)
 * is of type 'ask_question' — meaning the agent is waiting for an answer.
 */
export function usePendingQuestions() {
	const { data: pendingPaths = new Set<string>() } = useQuery({
		queryKey: ['pending-questions'],
		queryFn: async () => {
			// 1. Get all active sessions with a worktree_path
			const { data: sessions, error: sessErr } = await supabase
				.from('agent_sessions')
				.select('id, worktree_path')
				.eq('status', 'active')
				.not('worktree_path', 'is', null);

			if (sessErr) throw sessErr;
			if (!sessions || sessions.length === 0) return new Set<string>();

			const sessionIds = sessions.map((s) => s.id);

			// 2. Get the latest non-title log for each active session
			// We fetch recent logs and check the last one per session
			const { data: logs, error: logErr } = await supabase
				.from('agent_activity_logs')
				.select('agent_session_id, log_type, created_at')
				.in('agent_session_id', sessionIds)
				.neq('log_type', 'title')
				.order('created_at', { ascending: false });

			if (logErr) throw logErr;

			// 3. For each session, check if its most recent log is ask_question
			const paths = new Set<string>();
			const seen = new Set<string>();

			for (const log of logs ?? []) {
				if (seen.has(log.agent_session_id)) continue;
				seen.add(log.agent_session_id);

				if (log.log_type === 'ask_question') {
					const session = sessions.find((s) => s.id === log.agent_session_id);
					if (session?.worktree_path) {
						paths.add(session.worktree_path);
					}
				}
			}

			return paths;
		},
		refetchInterval: 5_000,
	});

	return pendingPaths;
}
