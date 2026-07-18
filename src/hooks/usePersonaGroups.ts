import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { PersonaGroup } from '@/types';

const KEY = ['persona-groups'];

export function usePersonaGroups() {
	const qc = useQueryClient();

	const query = useQuery({
		queryKey: KEY,
		queryFn: async () => {
			const res = await apiFetch('/api/persona-groups');
			if (!res.ok) throw new Error('Failed to fetch groups');
			return (await res.json()) as PersonaGroup[];
		},
	});

	const create = useMutation({
		mutationFn: async (group: { name: string; description?: string }) => {
			const res = await apiFetch('/api/persona-groups', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(group),
			});
			if (!res.ok) throw new Error('Failed to create group');
			return (await res.json()) as PersonaGroup;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});

	const update = useMutation({
		mutationFn: async (group: Partial<PersonaGroup> & { id: string }) => {
			const res = await apiFetch('/api/persona-groups', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(group),
			});
			if (!res.ok) throw new Error('Failed to update group');
			return (await res.json()) as PersonaGroup;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/persona-groups?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete group');
			return true;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});

	return {
		groups: query.data ?? [],
		isLoading: query.isLoading,
		create,
		update,
		remove,
	};
}

export function usePersonaGroup(id: string | undefined) {
	return useQuery({
		queryKey: ['persona-group', id],
		queryFn: async () => {
			const res = await apiFetch(`/api/persona-groups?id=${encodeURIComponent(id!)}`);
			if (!res.ok) throw new Error('Failed to fetch group');
			return (await res.json()) as PersonaGroup | null;
		},
		enabled: !!id,
	});
}
