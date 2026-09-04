import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';
import type { KeplerUpdateStatus } from '@/types';

const POLL_MS = 30 * 60_000;

/**
 * Retard du checkout Kepler sur `origin/<branche par défaut>`.
 *
 * Sondage lent (30 min) : côté agent chaque appel non mémoïsé fait un `git fetch`.
 * `retry: false` — si l'agent local est éteint, on ne sait simplement pas, et
 * insister n'y changerait rien.
 */
export function useKeplerUpdate() {
	const { data } = useQuery<KeplerUpdateStatus>({
		queryKey: ['kepler-update'],
		queryFn: async () => {
			const res = await localFetch('/kepler/update-status');
			if (!res.ok) throw new Error('Failed to fetch update status');
			return res.json();
		},
		staleTime: POLL_MS,
		refetchInterval: POLL_MS,
		retry: false,
	});

	return data ?? null;
}
