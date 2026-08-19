import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';
import type { ActiveSession } from '@/types';

async function fetchSessions(): Promise<ActiveSession[]> {
	const res = await localFetch('/sessions');
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	return data.sessions;
}

export type { ActiveSession };

export function useActiveSessions() {
	return useQuery({
		queryKey: ['sessions', 'active'],
		queryFn: fetchSessions,
		refetchInterval: 5_000,
	});
}
