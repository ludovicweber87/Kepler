import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { PersonaFolder, NewPersonaFolder, PersonaFolderPatch } from '@/types';

const QUERY_KEY = ['persona-folders'];

export function usePersonaFolders() {
	const queryClient = useQueryClient();

	const { data: folders = [], isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const res = await apiFetch('/api/persona-folders');
			if (!res.ok) throw new Error('Failed to fetch persona folders');
			return (await res.json()) as PersonaFolder[];
		},
	});

	const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

	const createMutation = useMutation({
		mutationFn: async (input: NewPersonaFolder) => {
			const res = await apiFetch('/api/persona-folders', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input),
			});
			if (!res.ok) throw new Error('Failed to create folder');
			return (await res.json()) as PersonaFolder;
		},
		onSettled: invalidate,
	});

	const updateMutation = useMutation({
		mutationFn: async (patch: PersonaFolderPatch) => {
			const res = await apiFetch('/api/persona-folders', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});
			if (!res.ok) throw new Error('Failed to update folder');
			return (await res.json()) as PersonaFolder;
		},
		onSettled: invalidate,
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/persona-folders?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete folder');
		},
		onSettled: () => {
			invalidate();
			// Les personas perdent des liens → rafraîchir la bibliothèque.
			queryClient.invalidateQueries({ queryKey: ['personas'] });
		},
	});

	const reorderMutation = useMutation({
		mutationFn: async (order: string[]) => {
			const res = await apiFetch('/api/persona-folders', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ order }),
			});
			if (!res.ok) throw new Error('Failed to reorder folders');
			return (await res.json()) as PersonaFolder[];
		},
		onMutate: async (order) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<PersonaFolder[]>(QUERY_KEY);
			queryClient.setQueryData<PersonaFolder[]>(QUERY_KEY, (old = []) => {
				const byId = new Map(old.map((f) => [f.id, f]));
				return order.map((id) => byId.get(id)).filter((f): f is PersonaFolder => !!f);
			});
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
		},
		onSettled: invalidate,
	});

	const createFolder = useCallback(
		(input: NewPersonaFolder) => createMutation.mutateAsync(input),
		[createMutation],
	);
	const updateFolder = useCallback(
		(patch: PersonaFolderPatch) => updateMutation.mutateAsync(patch),
		[updateMutation],
	);
	const deleteFolder = useCallback(
		(id: string) => deleteMutation.mutateAsync(id),
		[deleteMutation],
	);
	const reorderFolders = useCallback(
		(order: string[]) => reorderMutation.mutate(order),
		[reorderMutation],
	);

	return {
		folders,
		isLoading,
		createFolder,
		updateFolder,
		deleteFolder,
		reorderFolders,
	};
}
