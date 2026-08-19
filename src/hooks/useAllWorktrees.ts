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

	/**
	 * Renomme branche + dossier worktree (+ nom de session si `sessionId`) via le
	 * serveur agent. Le serveur slugifie l'entrée en kebab-case ; l'UI optimiste
	 * affiche le nouveau nom de branche en attendant la réponse.
	 */
	const renameWorktree = async (
		cwd: string,
		worktreePath: string,
		newName: string,
		sessionId?: string | null,
	) => {
		await queryClient.cancelQueries({ queryKey: ['git-worktrees', cwd] });
		const previous = queryClient.getQueryData<WorktreeInfo[]>(['git-worktrees', cwd]);
		try {
			const res = await localFetch('/git/rename-worktree', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ worktreePath, newName, sessionId: sessionId ?? undefined }),
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
			const data = (await res.json()) as { branch: string; worktreePath: string };
			queryClient.setQueryData<WorktreeInfo[]>(['git-worktrees', cwd], (old = []) =>
				old.map((wt) =>
					wt.path === worktreePath
						? { ...wt, branch: data.branch, path: data.worktreePath }
						: wt,
				),
			);
			return data;
		} catch (err) {
			if (previous) queryClient.setQueryData(['git-worktrees', cwd], previous);
			throw err;
		} finally {
			queryClient.invalidateQueries({ queryKey: ['git-worktrees', cwd] });
			// Le serveur met à jour branch/worktree_path des sessions liées (pas agent_name).
			queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
			queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
			queryClient.invalidateQueries({ queryKey: ['agent-session'] });
		}
	};

	return {
		byPath: combined.byPath,
		isLoading: combined.isLoading,
		deleteWorktree,
		renameWorktree,
	};
}
