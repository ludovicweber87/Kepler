import { useQueries, useQueryClient } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';
import type { WorktreeInfo } from '@/types';

/**
 * Fetch worktrees for several project paths at once (for the "All projects" view).
 * Returns a map path → worktrees, plus a cwd-scoped delete (worktrees are project-bound).
 */
export function useAllWorktrees(paths: string[]) {
	const queryClient = useQueryClient();

	const combined = useQueries({
		queries: paths.map((p) => ({
			queryKey: ['git-worktrees', p],
			queryFn: async () => {
				const res = await localFetch(`/git/worktrees?cwd=${encodeURIComponent(p)}`);
				if (!res.ok) throw new Error('Failed to fetch worktrees');
				const { worktrees } = await res.json();
				return worktrees as WorktreeInfo[];
			},
			enabled: !!p,
			staleTime: 30_000,
		})),
		combine: (results) => {
			const byPath = new Map<string, WorktreeInfo[]>();
			results.forEach((r, i) => byPath.set(paths[i], r.data ?? []));
			return {
				byPath,
				isLoading: results.length > 0 && results.some((r) => r.isLoading),
			};
		},
	});

	const deleteWorktree = async (cwd: string, worktreePath: string, deleteBranch: boolean) => {
		await queryClient.cancelQueries({ queryKey: ['git-worktrees', cwd] });
		const previous = queryClient.getQueryData<WorktreeInfo[]>(['git-worktrees', cwd]);
		queryClient.setQueryData<WorktreeInfo[]>(['git-worktrees', cwd], (old = []) =>
			old.filter((wt) => wt.path !== worktreePath),
		);
		try {
			const res = await localFetch('/git/worktrees', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cwd, worktreePath, deleteBranch }),
			});
			if (!res.ok) {
				let detail = `HTTP ${res.status}`;
				try {
					const data = await res.json();
					if (data?.error) detail = data.error;
				} catch {
					/* non-JSON body */
				}
				throw new Error(detail);
			}
		} catch (err) {
			if (previous) queryClient.setQueryData(['git-worktrees', cwd], previous);
			throw err;
		} finally {
			queryClient.invalidateQueries({ queryKey: ['git-worktrees', cwd] });
			// The server also removes any agent session bound to this worktree,
			// so refresh the Dashboard's active + past sessions and reports.
			queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
			queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
			queryClient.invalidateQueries({ queryKey: ['agent-summaries'] });
		}
	};

	return { byPath: combined.byPath, isLoading: combined.isLoading, deleteWorktree };
}
