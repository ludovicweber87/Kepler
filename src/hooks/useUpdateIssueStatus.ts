import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardData, GitHubIssue } from '@/types';
import { apiFetch } from '@/lib/api-fetch';

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

interface BoardData {
	boardIssuesByView?: Record<string, GitHubIssue[]>;
	boardIssues?: GitHubIssue[];
	[k: string]: unknown;
}

function updateBoardIssues(
	old: BoardData | undefined,
	params: UpdateStatusParams,
): BoardData | undefined {
	if (!old) return old;
	const patchList = (list: GitHubIssue[]) =>
		list.map((issue) =>
			issue.node_id === params.issueNodeId ? withStatus(issue, params.newStatus) : issue,
		);
	const next: BoardData = { ...old };
	if (old.boardIssuesByView) {
		const byView: Record<string, GitHubIssue[]> = {};
		for (const [view, issues] of Object.entries(old.boardIssuesByView)) {
			byView[view] = patchList(issues);
		}
		next.boardIssuesByView = byView;
	}
	if (Array.isArray(old.boardIssues)) {
		next.boardIssues = patchList(old.boardIssues);
	}
	return next;
}

export function useUpdateIssueStatus() {
	const queryClient = useQueryClient();

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
			const boardKey = ['project-board', params.org, params.projectNumber];
			await Promise.all([
				queryClient.cancelQueries({ queryKey: DASHBOARD_KEY_PREFIX }),
				queryClient.cancelQueries({ queryKey: boardKey }),
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

			// Move the card on the board (cache-backed, no refetch)
			const previousBoard = queryClient.getQueryData<BoardData>(boardKey);
			queryClient.setQueryData<BoardData>(boardKey, (old) => updateBoardIssues(old, params));

			return { previousDashboard, previousBoard, boardKey };
		},
		onError: (_err, _params, context) => {
			for (const [key, data] of context?.previousDashboard ?? []) {
				queryClient.setQueryData(key, data);
			}
			if (context?.boardKey && context.previousBoard !== undefined) {
				queryClient.setQueryData(context.boardKey, context.previousBoard);
			}
		},
		onSettled: () => {
			// Only invalidate the (assigned-issues) dashboard; the board stays cache-backed
			// and was already patched optimistically + server-side. No board refetch.
			queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY_PREFIX });
		},
	});
}
