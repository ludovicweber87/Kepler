import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { AppNotification } from '@/types';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'];

export function useNotifications() {
	const { data: notifications = [], isLoading } = useQuery({
		queryKey: NOTIFICATIONS_QUERY_KEY,
		queryFn: async () => {
			const res = await apiFetch('/api/notifications?limit=50');
			if (!res.ok) throw new Error('Failed to fetch notifications');
			return (await res.json()) as AppNotification[];
		},
		staleTime: 30_000,
	});

	return { notifications, isLoading };
}
