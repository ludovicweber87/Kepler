import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { nextSortOrder } from '@/lib/repoScripts';
import type { RepoScript, RepoScriptRunMode } from '@/types';

export interface NewRepoScript {
	name?: string;
	script?: string;
	run_mode?: RepoScriptRunMode;
}

export type RepoScriptPatch = { id: string } & Partial<
	Pick<RepoScript, 'name' | 'script' | 'run_mode' | 'sort_order'>
>;

export function useRepoScripts(repoFullName: string | null) {
	const qc = useQueryClient();
	const key = ['repo-scripts', repoFullName];

	const query = useQuery({
		queryKey: key,
		enabled: !!repoFullName,
		queryFn: async (): Promise<RepoScript[]> => {
			const res = await apiFetch(
				`/api/repo-scripts?repo=${encodeURIComponent(repoFullName!)}`,
			);
			if (!res.ok) throw new Error('Failed to fetch repo scripts');
			return res.json();
		},
	});

	const scripts = query.data ?? [];

	const create = useMutation({
		mutationFn: async (input: NewRepoScript) => {
			if (!repoFullName) throw new Error('no repo');
			const res = await apiFetch('/api/repo-scripts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ repo_full_name: repoFullName, ...input }),
			});
			if (!res.ok) throw new Error('Failed to create repo script');
			return res.json() as Promise<RepoScript>;
		},
		onMutate: async (input) => {
			await qc.cancelQueries({ queryKey: key });
			const previous = qc.getQueryData<RepoScript[]>(key);
			const optimistic: RepoScript = {
				id: crypto.randomUUID(),
				repo_full_name: repoFullName!,
				name: input.name ?? '',
				script: input.script ?? '',
				run_mode: input.run_mode ?? 'terminal',
				sort_order: nextSortOrder(previous ?? []),
				created_at: new Date().toISOString(),
			};
			qc.setQueryData<RepoScript[]>(key, [...(previous ?? []), optimistic]);
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) qc.setQueryData(key, ctx.previous);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: key }),
	});

	const update = useMutation({
		mutationFn: async (patch: RepoScriptPatch) => {
			const res = await apiFetch('/api/repo-scripts', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});
			if (!res.ok) throw new Error('Failed to update repo script');
			return res.json() as Promise<RepoScript>;
		},
		onMutate: async (patch) => {
			await qc.cancelQueries({ queryKey: key });
			const previous = qc.getQueryData<RepoScript[]>(key);
			qc.setQueryData<RepoScript[]>(
				key,
				(previous ?? []).map((s) => (s.id === patch.id ? { ...s, ...patch } : s)),
			);
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) qc.setQueryData(key, ctx.previous);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: key }),
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/repo-scripts?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete repo script');
		},
		onMutate: async (id) => {
			await qc.cancelQueries({ queryKey: key });
			const previous = qc.getQueryData<RepoScript[]>(key);
			qc.setQueryData<RepoScript[]>(
				key,
				(previous ?? []).filter((s) => s.id !== id),
			);
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) qc.setQueryData(key, ctx.previous);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: key }),
	});

	return {
		scripts,
		isLoading: query.isLoading,
		create: (input: NewRepoScript = {}) => create.mutateAsync(input).then(() => undefined),
		update: (patch: RepoScriptPatch) => update.mutateAsync(patch).then(() => undefined),
		remove: (id: string) => remove.mutateAsync(id).then(() => undefined),
	};
}
