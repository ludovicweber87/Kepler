import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { BoardIssue } from '@/lib/boardMerge';

interface RepoIssuesResponse {
	issues: BoardIssue[];
	statusColumns: string[];
	fetchedAt: string | null;
	error?: string;
}

/**
 * Issues du repo de la tab active, fetchées à la demande (lazy) et cachées par repo.
 * Tout arrive déjà réconcilié du serveur (lanes, statut, __config).
 */
export function useRepoIssues(repo: string | null) {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ['repo-issues', repo],
		enabled: !!repo,
		queryFn: async (): Promise<RepoIssuesResponse> => {
			const res = await apiFetch(`/api/github/repo-issues?repo=${encodeURIComponent(repo!)}`);
			if (!res.ok) throw new Error(`Repo issues fetch failed: ${res.status}`);
			return res.json();
		},
	});

	const refresh = async () => {
		if (!repo) return;
		await queryClient.invalidateQueries({ queryKey: ['repo-issues', repo] });
	};

	return {
		issues: query.data?.issues ?? [],
		statusColumns: query.data?.statusColumns ?? [],
		fetchedAt: query.data?.fetchedAt ?? null,
		isLoading: !!repo && query.isLoading,
		error: query.error as Error | undefined,
		refresh,
	};
}
