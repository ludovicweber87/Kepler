import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardData, GitHubIssue } from '@/types';
import { apiFetch } from '@/lib/api-fetch';
import { useSnackbar } from '@/hooks/useSnackbar';

interface UpdateStatusParams {
	issueNodeId: string;
	newStatus: string;
	org: string;
	projectNumber: number;
	ownerType?: 'organization' | 'user';
}

const DASHBOARD_KEY_PREFIX = ['github', 'dashboard'];

function withStatus(issue: GitHubIssue, newStatus: string): GitHubIssue {
	return {
		...issue,
		project_columns: issue.project_columns?.length
			? issue.project_columns.map((col) => ({ ...col, column: newStatus }))
			: [{ project: '', column: newStatus }],
	};
}

function updateDashboardIssues(
	old: DashboardData | undefined,
	params: UpdateStatusParams,
): DashboardData | undefined {
	if (!old) return old;
	return {
		...old,
		issues: old.issues.map((issue) =>
			issue.node_id === params.issueNodeId ? withStatus(issue, params.newStatus) : issue,
		),
	};
}

interface RepoIssuesData {
	issues?: GitHubIssue[];
	[k: string]: unknown;
}

function updateRepoIssues(
	old: RepoIssuesData | undefined,
	params: UpdateStatusParams,
): RepoIssuesData | undefined {
	if (!old) return old;
	if (!Array.isArray(old.issues)) return old;
	return {
		...old,
		issues: old.issues.map((issue) =>
			issue.node_id === params.issueNodeId ? withStatus(issue, params.newStatus) : issue,
		),
	};
}

export function useUpdateIssueStatus() {
	const queryClient = useQueryClient();
	const { showSnackbar } = useSnackbar();

	return useMutation({
		mutationFn: async (params: UpdateStatusParams) => {
			const res = await apiFetch('/api/github/issues', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to update status');
			}
		},
		onMutate: async (params) => {
			await Promise.all([
				queryClient.cancelQueries({ queryKey: DASHBOARD_KEY_PREFIX }),
				queryClient.cancelQueries({ queryKey: ['repo-issues'] }),
			]);

			const previousDashboard: [readonly unknown[], DashboardData][] = [];
			for (const [key, data] of queryClient.getQueriesData<DashboardData>({
				queryKey: DASHBOARD_KEY_PREFIX,
			})) {
				if (data) previousDashboard.push([key, data]);
			}
			queryClient.setQueriesData<DashboardData>({ queryKey: DASHBOARD_KEY_PREFIX }, (old) =>
				updateDashboardIssues(old, params),
			);

			// Move the card across every cached repo-issues tab (params carry issueNodeId, not repo).
			const previousRepoIssues: [readonly unknown[], RepoIssuesData][] = [];
			for (const [key, data] of queryClient.getQueriesData<RepoIssuesData>({
				queryKey: ['repo-issues'],
			})) {
				if (data) previousRepoIssues.push([key, data]);
			}
			queryClient.setQueriesData<RepoIssuesData>({ queryKey: ['repo-issues'] }, (old) =>
				updateRepoIssues(old, params),
			);

			return { previousDashboard, previousRepoIssues };
		},
		onError: (err, _params, context) => {
			for (const [key, data] of context?.previousDashboard ?? []) {
				queryClient.setQueryData(key, data);
			}
			for (const [key, data] of context?.previousRepoIssues ?? []) {
				queryClient.setQueryData(key, data);
			}
			showSnackbar(err instanceof Error ? err.message : 'Failed to update status', 'error');
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY_PREFIX });
			queryClient.invalidateQueries({ queryKey: ['repo-issues'] });
		},
	});
}
