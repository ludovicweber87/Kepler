import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { WorktreeInfo } from '@/app/api/git/worktrees/route';

export type { WorktreeInfo };

export function useWorktrees(localPath: string | undefined) {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ['git-worktrees', localPath],
		queryFn: async () => {
			const res = await apiFetch(
				`/api/git/worktrees?cwd=${encodeURIComponent(localPath!)}`,
			);
			if (!res.ok) throw new Error('Failed to fetch worktrees');
			const { worktrees } = await res.json();
			return worktrees as WorktreeInfo[];
		},
		enabled: !!localPath,
		staleTime: 30_000,
	});

	const createMutation = useMutation({
		mutationFn: async (branch: string) => {
			const res = await apiFetch('/api/git/worktrees', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cwd: localPath, branch }),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to create worktree');
			}
			return (await res.json()) as { worktreePath: string; branch: string };
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['git-worktrees', localPath] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async ({ worktreePath, deleteBranch }: { worktreePath: string; deleteBranch: boolean }) => {
			const res = await apiFetch('/api/git/worktrees', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cwd: localPath, worktreePath, deleteBranch }),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to delete worktree');
			}
		},
		onMutate: async ({ worktreePath }) => {
			await queryClient.cancelQueries({ queryKey: ['git-worktrees', localPath] });
			const previous = queryClient.getQueryData<WorktreeInfo[]>(['git-worktrees', localPath]);

			queryClient.setQueryData<WorktreeInfo[]>(
				['git-worktrees', localPath],
				(old = []) => old.filter((wt) => wt.path !== worktreePath),
			);

			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(['git-worktrees', localPath], context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['git-worktrees', localPath] });
		},
	});

	return {
		worktrees: query.data ?? [],
		isLoading: query.isLoading,
		createWorktree: createMutation.mutateAsync,
		isCreating: createMutation.isPending,
		createError: createMutation.error,
		deleteWorktree: deleteMutation.mutate,
		isDeleting: deleteMutation.isPending,
	};
}
