import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { supabase } from '@/lib/supabase';

interface RepoPathRow {
	id: string;
	repo_full_name: string;
	local_path: string;
}

const QUERY_KEY = ['repo-paths'];

export function useRepoPaths() {
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const userId = session?.user?.id ?? null;

	const { data: repoPaths = [] } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const { data, error } = await supabase
				.from('repo_paths')
				.select('*')
				.eq('user_id', userId!)
				.order('repo_full_name');
			if (error) throw error;
			return data as RepoPathRow[];
		},
		enabled: !!userId,
	});

	const saveMutation = useMutation({
		mutationFn: async ({
			repoFullName,
			localPath,
		}: {
			repoFullName: string;
			localPath: string;
		}) => {
			const { error } = await supabase
				.from('repo_paths')
				.upsert(
					{ repo_full_name: repoFullName, local_path: localPath, user_id: userId },
					{ onConflict: 'repo_full_name' },
				);
			if (error) throw error;
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
			const { error } = await supabase
				.from('repo_paths')
				.delete()
				.eq('repo_full_name', repoFullName);
			if (error) throw error;
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

	return { repoPaths, savePath, deletePath, getLocalPath };
}
