import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { Persona, NewPersona } from '@/types';

const KEY = ['personas'];

export function usePersonas() {
	const qc = useQueryClient();

	const query = useQuery({
		queryKey: KEY,
		queryFn: async () => {
			const res = await apiFetch('/api/personas');
			if (!res.ok) throw new Error('Failed to fetch personas');
			return (await res.json()) as Persona[];
		},
	});

	const create = useMutation({
		mutationFn: async (persona: NewPersona) => {
			const res = await apiFetch('/api/personas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(persona),
			});
			if (!res.ok) throw new Error('Failed to create persona');
			return (await res.json()) as Persona;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});

	const update = useMutation({
		mutationFn: async (persona: Partial<Persona> & { id: string }) => {
			const res = await apiFetch('/api/personas', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(persona),
			});
			if (!res.ok) throw new Error('Failed to update persona');
			return (await res.json()) as Persona;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/personas?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as {
					error?: string;
					groups?: string[];
				} | null;
				const err = new Error(data?.error ?? 'Failed to delete persona') as Error & {
					groups?: string[];
				};
				err.groups = data?.groups;
				throw err;
			}
			return true;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});

	return {
		personas: query.data ?? [],
		isLoading: query.isLoading,
		create,
		update,
		remove,
	};
}
