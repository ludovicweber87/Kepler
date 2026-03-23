import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

function queryKey(group: string) {
	return ['tab-order', group];
}

/**
 * Generic hook for persisting tab order per group.
 * Returns the saved order + a reorder function.
 * Use `applyOrder(items, keyFn)` to sort items by saved order.
 */
export function useTabOrder(group: string) {
	const qc = useQueryClient();

	const { data: order = [] } = useQuery({
		queryKey: queryKey(group),
		queryFn: async () => {
			const res = await apiFetch(`/api/tab-orders?group=${encodeURIComponent(group)}`);
			if (!res.ok) throw new Error('Failed to fetch tab order');
			const data = await res.json();
			return (data.tab_order as string[]) ?? [];
		},
	});

	const mutation = useMutation({
		mutationFn: async (newOrder: string[]) => {
			const res = await apiFetch('/api/tab-orders', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tab_group: group, tab_order: newOrder }),
			});
			if (!res.ok) throw new Error('Failed to save tab order');
		},
		onMutate: async (newOrder) => {
			await qc.cancelQueries({ queryKey: queryKey(group) });
			qc.setQueryData(queryKey(group), newOrder);
		},
		onError: () => {
			qc.invalidateQueries({ queryKey: queryKey(group) });
		},
	});

	const reorder = useCallback((newOrder: string[]) => mutation.mutate(newOrder), [mutation]);

	/**
	 * Sort an array of items according to saved order.
	 * Items not in the saved order are appended at the end.
	 */
	function applyOrder<T>(items: T[], keyFn: (item: T) => string): T[] {
		if (order.length === 0) return items;
		const byKey = new Map(items.map((item) => [keyFn(item), item]));
		const ordered: T[] = [];
		for (const key of order) {
			const item = byKey.get(key);
			if (item) {
				ordered.push(item);
				byKey.delete(key);
			}
		}
		// Append items not in saved order
		for (const item of byKey.values()) {
			ordered.push(item);
		}
		return ordered;
	}

	return { order, reorder, applyOrder };
}
