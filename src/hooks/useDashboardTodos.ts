import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useSupabase } from '@/hooks/useSupabase';
import { useCallback } from 'react';

export interface DashboardTodo {
	id: string;
	repo_full_name: string;
	title: string;
	done: boolean;
	created_at: string;
}

export function useDashboardTodos(limit = 8) {
	const { data: session } = useSession();
	const userId = session?.user?.id ?? null;
	const queryClient = useQueryClient();
	const { supabase, isReady } = useSupabase();

	const { data: todos = [], isLoading } = useQuery({
		queryKey: ['todos', 'dashboard', limit],
		queryFn: async () => {
			const { data, error } = await supabase
				.from('todos')
				.select('id, repo_full_name, title, done, created_at')
				.eq('user_id', userId!)
				.eq('done', false)
				.order('sort_order')
				.order('created_at')
				.limit(limit);

			if (error) throw error;
			return data as DashboardTodo[];
		},
		enabled: !!userId && isReady,
		refetchInterval: 30_000,
	});

	const toggleMutation = useMutation({
		mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
			const { error } = await supabase.from('todos').update({ done }).eq('id', id);
			if (error) throw error;
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
