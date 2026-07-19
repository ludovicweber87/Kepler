import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { RepoSettings } from '@/types';

function defaults(repo: string): RepoSettings {
	return {
		repo_full_name: repo,
		create_pr_prompt: '',
		commit_push_prompt: '',
		files_to_copy: '',
		setup_script: '',
		setup_script_name: '',
		archive_script: '',
		qa_column: '',
	};
}

export function useRepoSettings(repoFullName: string | null) {
	const qc = useQueryClient();
	const key = ['repo-settings', repoFullName];

	const query = useQuery({
		queryKey: key,
		enabled: !!repoFullName,
		queryFn: async (): Promise<RepoSettings> => {
			const res = await apiFetch(
				`/api/repo-settings?repo=${encodeURIComponent(repoFullName!)}`,
			);
			if (!res.ok) throw new Error('Failed to fetch repo settings');
			return res.json();
		},
	});

	const settings = query.data ?? (repoFullName ? defaults(repoFullName) : defaults(''));

	const mutation = useMutation({
		mutationFn: async (patch: Partial<RepoSettings>) => {
			if (!repoFullName) throw new Error('no repo');
			const current = qc.getQueryData<RepoSettings>(key) ?? settings;
			const next = { ...current, ...patch, repo_full_name: repoFullName };
			const res = await apiFetch('/api/repo-settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(next),
			});
			if (!res.ok) throw new Error('Failed to save repo settings');
			return next;
		},
		onSuccess: (next) => qc.setQueryData(key, next),
	});

	return {
		settings,
		save: (patch: Partial<RepoSettings>) => mutation.mutateAsync(patch).then(() => undefined),
		isLoading: query.isLoading,
		isSaving: mutation.isPending,
	};
}
