import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

export function usePendingTodoCount() {
	const { data: count = 0 } = useQuery({
		queryKey: ['todos', 'pending-count'],
		queryFn: async () => {
			const res = await apiFetch('/api/todos?countOnly=true');
			if (!res.ok) throw new Error('Failed to fetch pending count');
			const data = await res.json();
			return data.count ?? 0;
		},
		refetchInterval: 30_000,
	});

	return count;
}
