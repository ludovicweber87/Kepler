import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardData } from '@/types';
import { apiFetch } from '@/lib/api-fetch';

interface UpdateStatusParams {
	issueNodeId: string;
	newStatus: string;
	org: string;
	projectNumber: number;
	ownerType?: 'organization' | 'user';
}

const DASHBOARD_KEY_PREFIX = ['github', 'dashboard'];

function updateDashboardIssues(
	old: DashboardData | undefined,
	params: UpdateStatusParams,
): DashboardData | undefined {
	if (!old) return old;
	return {
		...old,
		issues: old.issues.map((issue) =>
			issue.node_id === params.issueNodeId
				? {
						...issue,
						project_columns: issue.project_columns?.map((col) => ({
							...col,
							column: params.newStatus,
						})) ?? [{ project: '', column: params.newStatus }],
					}
				: issue,
		),
	};
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
			await queryClient.cancelQueries({ queryKey: DASHBOARD_KEY_PREFIX });

			const previousEntries: [readonly unknown[], DashboardData][] = [];
			const queries = queryClient.getQueriesData<DashboardData>({
				queryKey: DASHBOARD_KEY_PREFIX,
			});
			for (const [key, data] of queries) {
				if (data) previousEntries.push([key, data]);
			}

			queryClient.setQueriesData<DashboardData>({ queryKey: DASHBOARD_KEY_PREFIX }, (old) =>
				updateDashboardIssues(old, params),
			);

			return { previousEntries };
		},
		onError: (_err, _params, context) => {
			if (context?.previousEntries) {
				for (const [key, data] of context.previousEntries) {
					queryClient.setQueryData(key, data);
				}
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY_PREFIX });
		},
	});
}
