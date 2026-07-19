import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { GitHubLabel } from '@/types';

export interface IssueCreateMeta {
	labels: GitHubLabel[];
	milestones: { number: number; title: string }[];
	assignees: { login: string; avatar_url: string }[];
}

/**
 * Labels / milestones / assignables du repo pour le formulaire de création d'issue.
 * Fetché uniquement quand `enabled` (modale ouverte), caché par repo.
 */
export function useIssueCreateMeta(repo: string | null, enabled: boolean) {
	const query = useQuery({
		queryKey: ['issue-create-meta', repo],
		enabled: !!repo && enabled,
		queryFn: async (): Promise<IssueCreateMeta> => {
			const res = await apiFetch(
				`/api/github/issue/create-meta?repo=${encodeURIComponent(repo!)}`,
			);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to load issue metadata');
			return data as IssueCreateMeta;
		},
	});

	return {
		labels: query.data?.labels ?? [],
		milestones: query.data?.milestones ?? [],
		assignees: query.data?.assignees ?? [],
		isLoading: query.isLoading,
		error: query.error as Error | undefined,
	};
}
