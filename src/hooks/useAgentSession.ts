import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

export interface AgentSession {
	id: string;
	session_id: string;
	project_path: string;
	project_name: string;
	branch: string | null;
	worktree_path: string | null;
	agent_name: string | null;
	status: 'active' | 'completed' | 'error' | 'provisioning';
	started_at: string;
	ended_at: string | null;
	archived_at: string | null;
	report_published_at: string | null;
	issue_owner: string | null;
	issue_repo: string | null;
	issue_number: number | null;
	issue_title: string | null;
	system_prompt: string | null;
	launch_mode: 'worktree' | 'current-branch' | 'existing-branch' | 'free' | null;
	model: string | null;
	effort: string | null;
	permission_mode: string | null;
	agent_color: string | null;
	persona_id: string | null;
}

export interface AgentActivityLog {
	id: string;
	agent_session_id: string;
	content: string;
	log_type: 'info' | 'commit' | 'file_change' | 'error' | 'summary' | 'ask_question';
	created_at: string;
}

function queryKey(sessionId: string) {
	return ['agent-session', sessionId];
}

export function useAgentSession(sessionId: string | undefined) {
	const qc = useQueryClient();

	const { data: session = null } = useQuery({
		queryKey: queryKey(sessionId ?? ''),
		queryFn: async () => {
			const res = await apiFetch(
				`/api/agent-sessions?sessionId=${encodeURIComponent(sessionId!)}`,
			);
			if (!res.ok) throw new Error('Failed to fetch session');
			return (await res.json()) as AgentSession | null;
		},
		enabled: !!sessionId,
	});

	const { data: logs = [] } = useQuery({
		queryKey: ['agent-session-logs', session?.id],
		queryFn: async () => {
			const res = await apiFetch(
				`/api/agent-sessions/logs?sessionId=${encodeURIComponent(session!.id)}`,
			);
			if (!res.ok) throw new Error('Failed to fetch logs');
			return (await res.json()) as AgentActivityLog[];
		},
		enabled: !!session?.id,
		refetchInterval: 10_000,
	});

	const ensureSessionMutation = useMutation({
		mutationFn: async (params: {
			sessionId: string;
			projectPath: string;
			projectName: string;
			branch?: string | null;
			worktreePath?: string | null;
			agentName?: string | null;
			issueOwner?: string | null;
			issueRepo?: string | null;
			issueNumber?: number | null;
			issueTitle?: string | null;
			systemPrompt?: string | null;
			status?: string;
			launchMode?: 'worktree' | 'current-branch' | 'existing-branch' | 'free';
			model?: string | null;
			effort?: string | null;
			permissionMode?: string | null;
			agentColor?: string | null;
			personaId?: string | null;
		}) => {
			const res = await apiFetch('/api/agent-sessions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					session_id: params.sessionId,
					project_path: params.projectPath,
					project_name: params.projectName,
					branch: params.branch ?? null,
					worktree_path: params.worktreePath ?? null,
					agent_name: params.agentName ?? null,
					issue_owner: params.issueOwner ?? null,
					issue_repo: params.issueRepo ?? null,
					issue_number: params.issueNumber ?? null,
					issue_title: params.issueTitle ?? null,
					system_prompt: params.systemPrompt ?? null,
					status: params.status ?? 'active',
					launch_mode: params.launchMode ?? 'worktree',
					model: params.model ?? null,
					effort: params.effort ?? null,
					permission_mode: params.permissionMode ?? null,
					agent_color: params.agentColor ?? null,
					persona_id: params.personaId ?? null,
				}),
			});
			if (!res.ok) throw new Error('Failed to ensure session');
			return (await res.json()) as AgentSession;
		},
		onSuccess: (data) => {
			qc.setQueryData(queryKey(data.session_id), data);
		},
	});

	const addLogMutation = useMutation({
		mutationFn: async (params: { content: string; logType?: AgentActivityLog['log_type'] }) => {
			if (!session) throw new Error('No session');
			const res = await apiFetch('/api/agent-sessions/logs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					agent_session_id: session.id,
					content: params.content,
					log_type: params.logType ?? 'info',
				}),
			});
			if (!res.ok) throw new Error('Failed to add log');
			return (await res.json()) as AgentActivityLog;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['agent-session-logs', session?.id] });
		},
	});

	const updateStatusMutation = useMutation({
		mutationFn: async (status: 'completed' | 'error') => {
			if (!session) throw new Error('No session');
			const res = await apiFetch('/api/agent-sessions', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: session.id,
					status,
					ended_at: new Date().toISOString(),
				}),
			});
			if (!res.ok) throw new Error('Failed to update status');
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKey(sessionId ?? '') });
			qc.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
		},
	});

	const updatePersonaMutation = useMutation({
		mutationFn: async (
			patch: Partial<{
				agent_name: string | null;
				agent_color: string | null;
				persona_id: string | null;
				model: string | null;
				effort: string | null;
				permission_mode: string | null;
				system_prompt: string | null;
			}>,
		) => {
			if (!session) throw new Error('No session');
			const res = await apiFetch('/api/agent-sessions', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: session.id, ...patch }),
			});
			if (!res.ok) throw new Error('Failed to update session persona');
			return (await res.json()) as AgentSession;
		},
		onMutate: async (patch) => {
			const key = queryKey(sessionId ?? '');
			const prev = qc.getQueryData<AgentSession | null>(key);
			if (prev) qc.setQueryData(key, { ...prev, ...patch });
			return { prev };
		},
		onError: (_err, _patch, ctx) => {
			if (ctx?.prev) qc.setQueryData(queryKey(sessionId ?? ''), ctx.prev);
		},
		onSuccess: (data) => {
			qc.setQueryData(queryKey(data.session_id), data);
			qc.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
		},
	});

	const ensureSession = useCallback(
		(params: Parameters<typeof ensureSessionMutation.mutate>[0]) =>
			ensureSessionMutation.mutate(params),
		[ensureSessionMutation],
	);

	const updatePersona = useCallback(
		(patch: Parameters<typeof updatePersonaMutation.mutate>[0]) =>
			updatePersonaMutation.mutate(patch),
		[updatePersonaMutation],
	);

	const addLog = useCallback(
		(content: string, logType?: AgentActivityLog['log_type']) =>
			addLogMutation.mutate({ content, logType }),
		[addLogMutation],
	);

	const updateStatus = useCallback(
		(status: 'completed' | 'error') => updateStatusMutation.mutate(status),
		[updateStatusMutation],
	);

	return { session, logs, ensureSession, addLog, updateStatus, updatePersona };
}

/** Fetch all sessions for history view (single source of truth for buckets). */
export function useAgentSessionHistory() {
	return useQuery({
		queryKey: ['agent-sessions', 'history'],
		queryFn: async () => {
			const res = await apiFetch('/api/agent-sessions');
			if (!res.ok) throw new Error('Failed to fetch session history');
			return (await res.json()) as AgentSession[];
		},
		refetchInterval: 5_000,
	});
}
