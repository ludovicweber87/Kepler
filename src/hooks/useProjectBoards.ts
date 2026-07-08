import { useQueries } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { GitHubIssue, ProjectV2Config } from '@/types';

interface ProjectBoardResponse {
	boardIssuesByView?: Record<string, GitHubIssue[]>;
}

/**
 * Fetch the board data (issues + PRs assigned to the logged-in user, per view) for every
 * configured project, and expose it keyed by view name. The Project V2 items are the single
 * source of truth — no per-issue REST fetch, PRs included.
 *
 * `combine` is memoized by React Query, so the returned `issuesByView` stays referentially
 * stable while the underlying data is unchanged.
 */
export function useProjectBoards(configs: ProjectV2Config[]) {
	return useQueries({
		queries: configs.map((c) => ({
			queryKey: ['project-board', c.org, c.projectNumber],
			queryFn: async (): Promise<ProjectBoardResponse> => {
				const res = await apiFetch(
					`/api/github/projects?org=${encodeURIComponent(c.org)}&projectNumber=${c.projectNumber}&ownerType=${c.ownerType ?? 'organization'}`,
				);
				if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
				return res.json();
			},
			staleTime: 5 * 60 * 1000,
		})),
		combine: (results) => {
			const issuesByView = new Map<string, GitHubIssue[]>();
			for (const r of results) {
				const map = r.data?.boardIssuesByView ?? {};
				for (const [viewName, issues] of Object.entries(map)) {
					issuesByView.set(viewName, issues);
				}
			}
			return {
				issuesByView,
				isLoading: results.length > 0 && results.some((r) => r.isLoading),
				isFetching: results.some((r) => r.isFetching),
				error: results.find((r) => r.error)?.error as Error | undefined,
				refetch: () => results.forEach((r) => r.refetch()),
			};
		},
	});
}
