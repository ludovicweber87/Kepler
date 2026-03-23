import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

interface SessionWithLastLog {
	id: string;
	worktree_path: string | null;
	lastLog: { log_type: string } | null;
}

/**
 * Returns a Set of worktree_path values where the agent's last log (excluding title)
 * is of type 'ask_question' — meaning the agent is waiting for an answer.
 */
export function usePendingQuestions() {
	const { data: pendingPaths = new Set<string>() } = useQuery({
		queryKey: ['pending-questions'],
		queryFn: async () => {
			const res = await apiFetch('/api/agent-sessions?status=active&withLastLog=true');
			if (!res.ok) throw new Error('Failed to fetch pending questions');
			const sessions = (await res.json()) as SessionWithLastLog[];

			const paths = new Set<string>();
			for (const s of sessions) {
				if (s.worktree_path && s.lastLog?.log_type === 'ask_question') {
					paths.add(s.worktree_path);
				}
			}
			return paths;
		},
		refetchInterval: 5_000,
	});

	return pendingPaths;
}
