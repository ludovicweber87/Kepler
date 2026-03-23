import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

interface RepoPathRow {
	id: string;
	repo_full_name: string;
	local_path: string;
}

const QUERY_KEY = ['repo-paths'];

export function useRepoPaths() {
	const queryClient = useQueryClient();

	const { data: repoPaths = [], isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const res = await apiFetch('/api/repo-paths');
			if (!res.ok) throw new Error('Failed to fetch repo paths');
			return (await res.json()) as RepoPathRow[];
		},
	});

	const repoPathsLoading = isLoading;

	const saveMutation = useMutation({
		mutationFn: async ({
			repoFullName,
			localPath,
		}: {
			repoFullName: string;
			localPath: string;
		}) => {
			const res = await apiFetch('/api/repo-paths', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ repo_full_name: repoFullName, local_path: localPath }),
			});
			if (!res.ok) throw new Error('Failed to save repo path');
		},
		onMutate: async ({ repoFullName, localPath }) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<RepoPathRow[]>(QUERY_KEY);

			queryClient.setQueryData<RepoPathRow[]>(QUERY_KEY, (old = []) => {
				const existing = old.findIndex((r) => r.repo_full_name === repoFullName);
				if (existing >= 0) {
					const next = [...old];
					next[existing] = { ...next[existing], local_path: localPath };
					return next;
				}
				return [
					...old,
					{
						id: crypto.randomUUID(),
						repo_full_name: repoFullName,
						local_path: localPath,
					},
				];
			});

			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(QUERY_KEY, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEY });
		},
	});

	const savePath = useCallback(
		(repoFullName: string, localPath: string) =>
			saveMutation.mutate({ repoFullName, localPath }),
		[saveMutation],
	);

	const deleteMutation = useMutation({
		mutationFn: async (repoFullName: string) => {
			const res = await apiFetch(
				`/api/repo-paths?repo_full_name=${encodeURIComponent(repoFullName)}`,
				{ method: 'DELETE' },
			);
			if (!res.ok) throw new Error('Failed to delete repo path');
		},
		onMutate: async (repoFullName) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<RepoPathRow[]>(QUERY_KEY);
			queryClient.setQueryData<RepoPathRow[]>(QUERY_KEY, (old = []) =>
				old.filter((r) => r.repo_full_name !== repoFullName),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(QUERY_KEY, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEY });
		},
	});

	const deletePath = useCallback(
		(repoFullName: string) => deleteMutation.mutate(repoFullName),
		[deleteMutation],
	);

	const getLocalPath = useCallback(
		(repoFullName: string): string | undefined =>
			repoPaths.find((r) => r.repo_full_name === repoFullName)?.local_path,
		[repoPaths],
	);

	return { repoPaths, repoPathsLoading, savePath, deletePath, getLocalPath };
}
