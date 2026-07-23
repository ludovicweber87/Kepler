import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { Task, NewTask, TaskPatch } from '@/types';

const QUERY_KEY = ['tasks'];

export function useTasks() {
	const queryClient = useQueryClient();

	const { data: tasks = [], isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const res = await apiFetch('/api/tasks');
			if (!res.ok) throw new Error('Failed to fetch tasks');
			return (await res.json()) as Task[];
		},
	});

	const setTasks = (updater: (old: Task[]) => Task[]) =>
		queryClient.setQueryData<Task[]>(QUERY_KEY, (old = []) => updater(old));

	const createMutation = useMutation({
		mutationFn: async (input: NewTask) => {
			const res = await apiFetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(input),
			});
			if (!res.ok) throw new Error('Failed to create task');
			return (await res.json()) as Task;
		},
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<Task[]>(QUERY_KEY);
			const now = new Date().toISOString();
			const optimistic: Task = {
				id: `optimistic-${crypto.randomUUID()}`,
				title: input.title,
				description: input.description ?? null,
				due_date: input.due_date ?? null,
				repo_full_name: input.repo_full_name ?? null,
				issue_owner: input.issue_owner ?? null,
				issue_repo: input.issue_repo ?? null,
				issue_number: input.issue_number ?? null,
				issue_title: input.issue_title ?? null,
				done: false,
				completed_at: null,
				pinned: input.pinned ?? false,
				created_at: now,
				updated_at: now,
			};
			setTasks((old) => [optimistic, ...old]);
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
	});

	const updateMutation = useMutation({
		mutationFn: async (patch: TaskPatch) => {
			const res = await apiFetch('/api/tasks', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});
			if (!res.ok) throw new Error('Failed to update task');
			return (await res.json()) as Task;
		},
		onMutate: async (patch) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<Task[]>(QUERY_KEY);
			const now = new Date().toISOString();
			setTasks((old) =>
				old.map((t) => {
					if (t.id !== patch.id) return t;
					const next = { ...t, ...patch, updated_at: now };
					if (patch.done !== undefined) {
						next.completed_at = patch.done ? now : null;
					}
					return next;
				}),
			);
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete task');
		},
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<Task[]>(QUERY_KEY);
			setTasks((old) => old.filter((t) => t.id !== id));
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
	});

	const createTask = useCallback(
		(input: NewTask) => createMutation.mutateAsync(input),
		[createMutation],
	);
	const updateTask = useCallback(
		(patch: TaskPatch) => updateMutation.mutateAsync(patch),
		[updateMutation],
	);
	const deleteTask = useCallback((id: string) => deleteMutation.mutate(id), [deleteMutation]);
	const toggleDone = useCallback(
		(task: Task) => updateMutation.mutate({ id: task.id, done: !task.done }),
		[updateMutation],
	);
	const togglePinned = useCallback(
		(task: Task) => updateMutation.mutate({ id: task.id, pinned: !task.pinned }),
		[updateMutation],
	);

	return {
		tasks,
		isLoading,
		createTask,
		updateTask,
		deleteTask,
		toggleDone,
		togglePinned,
	};
}
