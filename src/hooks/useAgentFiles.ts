import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

export interface AgentFile {
	filename: string;
	name: string;
	content: string;
}

function queryKey(projectPath: string) {
	return ['agent-files', projectPath];
}

async function fetchAgentFiles(projectPath: string): Promise<AgentFile[]> {
	const res = await apiFetch(`/api/filesystem/agents?path=${encodeURIComponent(projectPath)}`);
	if (!res.ok) throw new Error('Failed to fetch agents');
	const { agents } = await res.json();
	return agents;
}

export function useAgentFiles(projectPath: string | null) {
	const queryClient = useQueryClient();

	const { data: agents = [], isLoading } = useQuery({
		queryKey: queryKey(projectPath ?? ''),
		queryFn: () => fetchAgentFiles(projectPath!),
		enabled: !!projectPath,
	});

	const saveMutation = useMutation({
		mutationFn: async ({ filename, content }: { filename: string; content: string }) => {
			const res = await apiFetch('/api/filesystem/agents', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: projectPath, filename, content }),
			});
			if (!res.ok) throw new Error('Failed to save agent');
			return res.json();
		},
		onSettled: () => {
			if (projectPath) {
				queryClient.invalidateQueries({ queryKey: queryKey(projectPath) });
			}
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (filename: string) => {
			const res = await apiFetch('/api/filesystem/agents', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: projectPath, filename }),
			});
			if (!res.ok) throw new Error('Failed to delete agent');
		},
		onMutate: async (filename) => {
			if (!projectPath) return;
			await queryClient.cancelQueries({ queryKey: queryKey(projectPath) });
			const previous = queryClient.getQueryData<AgentFile[]>(queryKey(projectPath));
			queryClient.setQueryData<AgentFile[]>(queryKey(projectPath), (old = []) =>
				old.filter((a) => a.filename !== filename),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous && projectPath) {
				queryClient.setQueryData(queryKey(projectPath), context.previous);
			}
		},
		onSettled: () => {
			if (projectPath) {
				queryClient.invalidateQueries({ queryKey: queryKey(projectPath) });
			}
		},
	});

	const saveAgent = useCallback(
		(filename: string, content: string) => saveMutation.mutate({ filename, content }),
		[saveMutation],
	);

	const deleteAgent = useCallback(
		(filename: string) => deleteMutation.mutate(filename),
		[deleteMutation],
	);

	return { agents, isLoading, saveAgent, deleteAgent };
}
