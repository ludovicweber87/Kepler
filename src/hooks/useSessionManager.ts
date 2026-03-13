import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useActiveSessions, type ActiveSession } from '@/hooks/useActiveSessions';
import { useAgentSessionHistory, type AgentSession } from '@/hooks/useAgentSession';

export type { ActiveSession, AgentSession };

export function useSessionManager() {
	const queryClient = useQueryClient();
	const { data: activeSessions = [] } = useActiveSessions();
	const { data: allPastSessions = [] } = useAgentSessionHistory();

	// Past sessions = DB sessions that are NOT currently active in tmux
	const activeSessionIds = useMemo(
		() => new Set(activeSessions.map((s) => s.sessionId)),
		[activeSessions],
	);

	const pastSessions = useMemo(
		() => allPastSessions.filter((s) => !activeSessionIds.has(s.session_id)),
		[allPastSessions, activeSessionIds],
	);

	// Kill a tmux session + mark completed in DB
	const killSession = useCallback(
		async (sessionId: string) => {
			try {
				await fetch(`/api/agent-sessions/${encodeURIComponent(sessionId)}/kill`, {
					method: 'POST',
				});
				queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
				queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
			} catch {
				// ignore
			}
		},
		[queryClient],
	);

	// Delete a past session from DB
	const deleteSession = useCallback(
		async (id: string) => {
			try {
				await supabase.from('agent_activity_logs').delete().eq('agent_session_id', id);
				await supabase.from('agent_sessions').delete().eq('id', id);
				queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
			} catch {
				// ignore
			}
		},
		[queryClient],
	);

	// Find active tmux session for a given worktree path
	const getActiveForPath = useCallback(
		(path: string) => activeSessions.find((s) => s.cwd === path) ?? null,
		[activeSessions],
	);

	// Find past session for a worktree (by path, then branch fallback)
	const getPastForPath = useCallback(
		(path: string, branch?: string) =>
			pastSessions.find((s) => s.worktree_path === path) ??
			(branch ? pastSessions.find((s) => s.branch === branch) : null) ??
			null,
		[pastSessions],
	);

	return {
		activeSessions,
		pastSessions,
		killSession,
		deleteSession,
		getActiveForPath,
		getPastForPath,
	};
}
