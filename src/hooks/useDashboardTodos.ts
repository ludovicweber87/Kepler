import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export interface DashboardTodo {
	id: string;
	repo_full_name: string;
	title: string;
	done: boolean;
	created_at: string;
}

export function useDashboardTodos(limit = 8) {
	const queryClient = useQueryClient();

	const { data: todos = [], isLoading } = useQuery({
		queryKey: ['todos', 'dashboard', limit],
		queryFn: async () => {
			const res = await apiFetch(`/api/todos?limit=${limit}`);
			if (!res.ok) throw new Error('Failed to fetch dashboard todos');
			return (await res.json()) as DashboardTodo[];
		},
		refetchInterval: 30_000,
	});

	const toggleMutation = useMutation({
		mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
			const res = await apiFetch('/api/todos', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, done }),
			});
			if (!res.ok) throw new Error('Failed to toggle todo');
		},
		onMutate: async ({ id, done }) => {
			await queryClient.cancelQueries({ queryKey: ['todos', 'dashboard'] });
			const previous = queryClient.getQueryData<DashboardTodo[]>(['todos', 'dashboard', limit]);
			queryClient.setQueryData<DashboardTodo[]>(['todos', 'dashboard', limit], (old = []) =>
				old.map((t) => (t.id === id ? { ...t, done } : t)),
			);
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous)
				queryClient.setQueryData(['todos', 'dashboard', limit], ctx.previous);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['todos'] });
		},
	});

	const toggleTodo = useCallback(
		(id: string, done: boolean) => toggleMutation.mutate({ id, done }),
		[toggleMutation],
	);

	return { todos, isLoading, toggleTodo };
}
