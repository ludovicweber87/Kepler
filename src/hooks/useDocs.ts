import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { localFetch } from '@/lib/local-fetch';
import type { DocWithCategories, NewDoc, DocPatch } from '@/types';

const QUERY_KEY = ['docs'];

/** Déclenche la génération côté serveur agent (fire-and-forget). */
async function triggerGeneration(docId: string) {
	try {
		await localFetch('/docs/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ docId }),
		});
	} catch {
		/* serveur agent hors-ligne → la doc reste en 'queued', relançable */
	}
}

export function useDocs() {
	const queryClient = useQueryClient();

	const { data: docs = [], isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const res = await apiFetch('/api/docs');
			if (!res.ok) throw new Error('Failed to fetch docs');
			return (await res.json()) as DocWithCategories[];
		},
		// Poll tant qu'au moins une doc est en cours de génération.
		refetchInterval: (query) => {
			const data = query.state.data as DocWithCategories[] | undefined;
			const pending = data?.some((d) => d.status === 'queued' || d.status === 'generating');
			return pending ? 4000 : false;
		},
	});

	const setDocs = (updater: (old: DocWithCategories[]) => DocWithCategories[]) =>
		queryClient.setQueryData<DocWithCategories[]>(QUERY_KEY, (old = []) => updater(old));

	const createMutation = useMutation({
		mutationFn: async (input: NewDoc) => {
			const res = await apiFetch('/api/docs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input),
			});
			if (!res.ok) throw new Error('Failed to create doc');
			return (await res.json()) as DocWithCategories;
		},
		onSuccess: (doc) => {
			void triggerGeneration(doc.id);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
	});

	const updateMutation = useMutation({
		mutationFn: async (patch: DocPatch) => {
			const res = await apiFetch('/api/docs', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});
			if (!res.ok) throw new Error('Failed to update doc');
			return (await res.json()) as DocWithCategories;
		},
		onMutate: async (patch) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<DocWithCategories[]>(QUERY_KEY);
			setDocs((old) => old.map((d) => (d.id === patch.id ? { ...d, ...patch } : d)));
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/docs?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete doc');
		},
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<DocWithCategories[]>(QUERY_KEY);
			setDocs((old) => old.filter((d) => d.id !== id));
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
	});

	const createDoc = useCallback(
		(input: NewDoc) => createMutation.mutateAsync(input),
		[createMutation],
	);
	const updateDoc = useCallback(
		(patch: DocPatch) => updateMutation.mutateAsync(patch),
		[updateMutation],
	);
	const deleteDoc = useCallback((id: string) => deleteMutation.mutate(id), [deleteMutation]);
	const retryDoc = useCallback(
		async (id: string) => {
			await triggerGeneration(id);
			queryClient.invalidateQueries({ queryKey: QUERY_KEY });
		},
		[queryClient],
	);

	return { docs, isLoading, createDoc, updateDoc, deleteDoc, retryDoc };
}
