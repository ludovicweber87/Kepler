import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

/** Read/write a single global key/value setting (`app_settings` table). */
export function useAppSetting(key: string, defaultValue = '') {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ['app-setting', key],
		queryFn: async () => {
			const res = await apiFetch(`/api/settings?key=${encodeURIComponent(key)}`);
			if (!res.ok) throw new Error('Failed to fetch setting');
			const { value } = (await res.json()) as { value: string | null };
			return value;
		},
	});

	const mutation = useMutation({
		mutationFn: async (value: string) => {
			const res = await apiFetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key, value }),
			});
			if (!res.ok) throw new Error('Failed to save setting');
			return value;
		},
		onSuccess: (value) => queryClient.setQueryData(['app-setting', key], value),
	});

	return {
		value: query.data ?? null,
		// Fallback au défaut tant que rien n'est enregistré.
		valueOrDefault: (query.data ?? '') || defaultValue,
		isLoading: query.isLoading,
		save: (value: string) => mutation.mutateAsync(value),
		isSaving: mutation.isPending,
	};
}
