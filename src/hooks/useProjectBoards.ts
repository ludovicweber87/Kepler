import { useQueries, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { GitHubIssue, ProjectV2Config, ProjectV2View, ViewRepoMapping } from '@/types';

interface ProjectBoardResponse {
	views?: ProjectV2View[];
	viewRepoMappings?: ViewRepoMapping[];
	statusColumns?: string[];
	boardIssuesByView?: Record<string, GitHubIssue[]>;
	fetchedAt?: string | null;
	error?: string;
}

function boardUrl(c: ProjectV2Config, refresh = false) {
	return `/api/github/projects?org=${encodeURIComponent(c.org)}&projectNumber=${c.projectNumber}&ownerType=${c.ownerType ?? 'organization'}${refresh ? '&refresh=1' : ''}`;
}

/**
 * Board data for every configured project, served from the SQLite snapshot cache.
 * - Mount / normal reads hit the read-through cache (no GitHub call once cached).
 * - `refresh()` is the ONLY action that re-fetches from GitHub (`?refresh=1`), then updates the cache.
 * - `perConfig` exposes each raw response so the caller can persist metadata into the config.
 */
export function useProjectBoards(configs: ProjectV2Config[]) {
	const queryClient = useQueryClient();

	const combined = useQueries({
		queries: configs.map((c) => ({
			queryKey: ['project-board', c.org, c.projectNumber],
			queryFn: async (): Promise<ProjectBoardResponse> => {
				const res = await apiFetch(boardUrl(c));
				if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
				return res.json();
			},
			staleTime: Infinity, // cache-backed: never auto-refetch, refresh is explicit
		})),
		combine: (results) => {
			const issuesByView = new Map<string, GitHubIssue[]>();
			const perConfig: { config: ProjectV2Config; data: ProjectBoardResponse }[] = [];
			let fetchedAt: string | null = null;
			results.forEach((r, i) => {
				if (!r.data) return;
				const map = r.data.boardIssuesByView ?? {};
				for (const [viewName, issues] of Object.entries(map)) {
					issuesByView.set(viewName, issues);
				}
				perConfig.push({ config: configs[i], data: r.data });
				// Keep the oldest fetch time so "updated X ago" reflects the stalest board.
				const f = r.data.fetchedAt;
				if (f && (!fetchedAt || f < fetchedAt)) fetchedAt = f;
			});
			return {
				issuesByView,
				perConfig,
				fetchedAt,
				isLoading: results.length > 0 && results.some((r) => r.isLoading),
				error: results.find((r) => r.error)?.error as Error | undefined,
			};
		},
	});

	// Explicit refresh: force a GitHub fetch for each project and update the query cache.
	const refresh = async () => {
		await Promise.all(
			configs.map(async (c) => {
				const res = await apiFetch(boardUrl(c, true));
				if (res.ok) {
					queryClient.setQueryData(
						['project-board', c.org, c.projectNumber],
						await res.json(),
					);
				}
			}),
		);
	};

	return { ...combined, refresh };
}
