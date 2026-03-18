import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { localFetch } from '@/lib/local-fetch';
import { useSupabase } from '@/hooks/useSupabase';
import { useActiveSessions, type ActiveSession } from '@/hooks/useActiveSessions';
import { useAgentSessionHistory, type AgentSession } from '@/hooks/useAgentSession';
import { useSnackbar } from '@/hooks/useSnackbar';

export type { ActiveSession, AgentSession };

export function useSessionManager() {
	const queryClient = useQueryClient();
	const { showSnackbar } = useSnackbar();
	const t = useTranslations('common');
	const { supabase } = useSupabase();
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
				await localFetch(`/agent-sessions/${encodeURIComponent(sessionId)}/kill`, {
					method: 'POST',
				});
				queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
				queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
				showSnackbar(t('sessionKilled'), 'success');
			} catch {
				// ignore
			}
		},
		[queryClient, showSnackbar, t],
	);

	// Delete a past session from DB
	const deleteSession = useCallback(
		async (id: string) => {
			try {
				await supabase.from('agent_activity_logs').delete().eq('agent_session_id', id);
				await supabase.from('agent_sessions').delete().eq('id', id);
				queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
				showSnackbar(t('sessionDeleted'), 'success');
			} catch {
				// ignore
			}
		},
		[queryClient, showSnackbar, t],
	);

	// Find active tmux session for a given worktree path
	const getActiveForPath = useCallback(
		(path: string) => activeSessions.find((s) => s.cwd === path) ?? null,
		[activeSessions],
	);

	// Find past session for a worktree (by path, then branch fallback) — cached, for display
	const getPastForPath = useCallback(
		(path: string, branch?: string) =>
			pastSessions.find((s) => s.worktree_path === path) ??
			(branch ? pastSessions.find((s) => s.branch === branch) : null) ??
			null,
		[pastSessions],
	);

	// Direct DB check — always fresh, no cache race condition
	// Use this in click handlers to determine if a worktree has a completed session
	const fetchSessionForPath = useCallback(
		async (worktreePath: string): Promise<AgentSession | null> => {
			const { data } = await supabase
				.from('agent_sessions')
				.select('*')
				.eq('worktree_path', worktreePath)
				.order('started_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			return (data as AgentSession | null) ?? null;
		},
		[],
	);

	return {
		activeSessions,
		pastSessions,
		killSession,
		deleteSession,
		getActiveForPath,
		getPastForPath,
		fetchSessionForPath,
	};
}
