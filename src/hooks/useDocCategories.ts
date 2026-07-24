import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { DocCategory, NewDocCategory, DocCategoryPatch } from '@/types';

const QUERY_KEY = ['doc-categories'];

export function useDocCategories() {
	const queryClient = useQueryClient();

	const { data: categories = [], isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const res = await apiFetch('/api/doc-categories');
			if (!res.ok) throw new Error('Failed to fetch categories');
			return (await res.json()) as DocCategory[];
		},
	});

	const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

	const createMutation = useMutation({
		mutationFn: async (input: NewDocCategory) => {
			const res = await apiFetch('/api/doc-categories', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input),
			});
			if (!res.ok) throw new Error('Failed to create category');
			return (await res.json()) as DocCategory;
		},
		onSettled: invalidate,
	});

	const updateMutation = useMutation({
		mutationFn: async (patch: DocCategoryPatch) => {
			const res = await apiFetch('/api/doc-categories', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});
			if (!res.ok) throw new Error('Failed to update category');
			return (await res.json()) as DocCategory;
		},
		onSettled: invalidate,
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/doc-categories?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete category');
		},
		onSettled: () => {
			invalidate();
			// Les docs perdent des liens → rafraîchir la liste des docs.
			queryClient.invalidateQueries({ queryKey: ['docs'] });
		},
	});

	const reorderMutation = useMutation({
		mutationFn: async (order: string[]) => {
			const res = await apiFetch('/api/doc-categories', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ order }),
			});
			if (!res.ok) throw new Error('Failed to reorder categories');
			return (await res.json()) as DocCategory[];
		},
		onMutate: async (order) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<DocCategory[]>(QUERY_KEY);
			queryClient.setQueryData<DocCategory[]>(QUERY_KEY, (old = []) => {
				const byId = new Map(old.map((c) => [c.id, c]));
				return order.map((id) => byId.get(id)).filter((c): c is DocCategory => !!c);
			});
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
		},
		onSettled: invalidate,
	});

	const createCategory = useCallback(
		(input: NewDocCategory) => createMutation.mutateAsync(input),
		[createMutation],
	);
	const updateCategory = useCallback(
		(patch: DocCategoryPatch) => updateMutation.mutateAsync(patch),
		[updateMutation],
	);
	const deleteCategory = useCallback(
		(id: string) => deleteMutation.mutateAsync(id),
		[deleteMutation],
	);
	const reorderCategories = useCallback(
		(order: string[]) => reorderMutation.mutate(order),
		[reorderMutation],
	);

	return {
		categories,
		isLoading,
		createCategory,
		updateCategory,
		deleteCategory,
		reorderCategories,
	};
}
