import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

export interface CreateIssueParams {
	owner: string;
	repo: string;
	title: string;
	body?: string;
	labels?: string[];
	assignees?: string[];
	milestone?: number | null;
	status?: string | null;
}

export interface CreateIssueResult {
	ok: boolean;
	number: number;
	html_url: string;
	boardWarning: string | null;
}

export function useCreateIssue() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (params: CreateIssueParams): Promise<CreateIssueResult> => {
			const res = await apiFetch('/api/github/issue/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to create issue');
			return data as CreateIssueResult;
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['repo-issues'] });
			queryClient.invalidateQueries({ queryKey: ['github', 'dashboard'] });
			// Project V2 indexe l'item de façon asynchrone : un second refetch différé
			// laisse le temps à l'issue de se placer dans sa colonne (sinon « No Status »).
			setTimeout(() => {
				queryClient.invalidateQueries({ queryKey: ['repo-issues'] });
				queryClient.invalidateQueries({ queryKey: ['github', 'dashboard'] });
			}, 2000);
		},
	});
}
