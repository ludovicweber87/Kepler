import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

export interface Todo {
	id: string;
	repo_full_name: string;
	title: string;
	description: string;
	done: boolean;
	sort_order: number;
	created_at: string;
	issue_number: number | null;
	issue_repo: string | null;
}

function queryKey(repo: string) {
	return ['todos', repo];
}

export function useTodos(repoFullName: string | null) {
	const queryClient = useQueryClient();
	const key = queryKey(repoFullName ?? '');

	const { data: todos = [], isLoading } = useQuery({
		queryKey: key,
		queryFn: async () => {
			const res = await apiFetch(`/api/todos?repo=${encodeURIComponent(repoFullName!)}`);
			if (!res.ok) throw new Error('Failed to fetch todos');
			return (await res.json()) as Todo[];
		},
		enabled: !!repoFullName,
	});

	const addMutation = useMutation({
		mutationFn: async (params: { title: string; issueNumber?: number; issueRepo?: string }) => {
			const maxOrder = todos.length > 0 ? Math.max(...todos.map((t) => t.sort_order)) + 1 : 0;
			const res = await apiFetch('/api/todos', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					repo_full_name: repoFullName,
					title: params.title,
					sort_order: maxOrder,
					issue_number: params.issueNumber ?? null,
					issue_repo: params.issueRepo ?? null,
				}),
			});
			if (!res.ok) throw new Error('Failed to add todo');
		},
		onMutate: async (params) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<Todo[]>(key);
			queryClient.setQueryData<Todo[]>(key, (old = []) => [
				...old,
				{
					id: crypto.randomUUID(),
					repo_full_name: repoFullName!,
					title: params.title,
					description: '',
					done: false,
					sort_order: old.length,
					created_at: new Date().toISOString(),
					issue_number: params.issueNumber ?? null,
					issue_repo: params.issueRepo ?? null,
				},
			]);
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: key });
			queryClient.invalidateQueries({ queryKey: ['todos', 'pending-count'] });
		},
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
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<Todo[]>(key);
			queryClient.setQueryData<Todo[]>(key, (old = []) =>
				old.map((t) => (t.id === id ? { ...t, done } : t)),
			);
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: key });
			queryClient.invalidateQueries({ queryKey: ['todos', 'pending-count'] });
		},
	});

	const updateMutation = useMutation({
		mutationFn: async ({ id, title }: { id: string; title: string }) => {
			const res = await apiFetch('/api/todos', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, title }),
			});
			if (!res.ok) throw new Error('Failed to update todo');
		},
		onMutate: async ({ id, title }) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<Todo[]>(key);
			queryClient.setQueryData<Todo[]>(key, (old = []) =>
				old.map((t) => (t.id === id ? { ...t, title } : t)),
			);
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: key });
			queryClient.invalidateQueries({ queryKey: ['todos', 'pending-count'] });
		},
	});

	const descriptionMutation = useMutation({
		mutationFn: async ({ id, description }: { id: string; description: string }) => {
			const res = await apiFetch('/api/todos', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, description }),
			});
			if (!res.ok) throw new Error('Failed to update description');
		},
		onMutate: async ({ id, description }) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<Todo[]>(key);
			queryClient.setQueryData<Todo[]>(key, (old = []) =>
				old.map((t) => (t.id === id ? { ...t, description } : t)),
			);
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: key });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/todos?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete todo');
		},
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<Todo[]>(key);
			queryClient.setQueryData<Todo[]>(key, (old = []) => old.filter((t) => t.id !== id));
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: key });
			queryClient.invalidateQueries({ queryKey: ['todos', 'pending-count'] });
		},
	});

	const addTodo = useCallback(
		(title: string, issueNumber?: number, issueRepo?: string) =>
			addMutation.mutate({ title, issueNumber, issueRepo }),
		[addMutation],
	);
	const toggleTodo = useCallback(
		(id: string, done: boolean) => toggleMutation.mutate({ id, done }),
		[toggleMutation],
	);
	const updateTodo = useCallback(
		(id: string, title: string) => updateMutation.mutate({ id, title }),
		[updateMutation],
	);
	const updateDescription = useCallback(
		(id: string, description: string) => descriptionMutation.mutate({ id, description }),
		[descriptionMutation],
	);
	const deleteTodo = useCallback((id: string) => deleteMutation.mutate(id), [deleteMutation]);

	return { todos, isLoading, addTodo, toggleTodo, updateTodo, updateDescription, deleteTodo };
}

/** Find todos linked to a specific issue */
export function useIssueTodos(issueRepo: string | null, issueNumber: number | null) {
	return useQuery({
		queryKey: ['todos', 'issue', issueRepo, issueNumber],
		queryFn: async () => {
			const res = await apiFetch(
				`/api/todos?issueRepo=${encodeURIComponent(issueRepo!)}&issueNumber=${issueNumber}`,
			);
			if (!res.ok) throw new Error('Failed to fetch issue todos');
			return (await res.json()) as Todo[];
		},
		enabled: !!issueRepo && issueNumber != null,
	});
}

/** Mark all todos for an issue as done */
export async function completeIssueTodos(issueRepo: string, issueNumber: number) {
	const res = await apiFetch('/api/todos/complete-issue', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ issueRepo, issueNumber }),
	});
	if (!res.ok) throw new Error('Failed to complete issue todos');
}
