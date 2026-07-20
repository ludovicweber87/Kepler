import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { NOTIFICATIONS_QUERY_KEY } from '@/hooks/useNotifications';
import type { AppNotification } from '@/types';

export function useMarkNotifications() {
	const queryClient = useQueryClient();

	const patch = useCallback(
		(updater: (n: AppNotification) => AppNotification) => {
			queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_QUERY_KEY, (old = []) =>
				old.map(updater),
			);
		},
		[queryClient],
	);

	const markReadMutation = useMutation({
		mutationFn: async (ids: string[]) => {
			const res = await apiFetch('/api/notifications/mark-read', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids }),
			});
			if (!res.ok) throw new Error('Failed to mark notifications as read');
		},
		onMutate: async (ids) => {
			await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
			const previous = queryClient.getQueryData<AppNotification[]>(NOTIFICATIONS_QUERY_KEY);
			const now = new Date().toISOString();
			patch((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n));
			return { previous };
		},
		onError: (_err, _ids, context) => {
			if (context?.previous) {
				queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
		},
	});

	const markRead = useCallback(
		(ids: string[]) => markReadMutation.mutate(ids),
		[markReadMutation],
	);

	return { markRead };
}
