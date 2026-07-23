import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { localFetch } from '@/lib/local-fetch';

/**
 * Toutes les transitions du cycle de vie d'une session, avec la DB comme source
 * de vérité unique. Chaque action écrit la DB puis invalide les buckets.
 *
 *   stop      : active → passée (arrêt manuel : stoppe SDK + tmux, status=completed)
 *   resume    : passée → active (status=active ; le WS/chat se rouvre côté modal)
 *   archive   : → archivée (arrêt + archived_at)
 *   unarchive : archivée → passée (archived_at=null)
 *   remove    : supprime la ligne session (par id)
 */
export function useSessionActions() {
	const queryClient = useQueryClient();

	const invalidate = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
		queryClient.invalidateQueries({ queryKey: ['agent-session'] }); // single-session queries
		queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
	}, [queryClient]);

	const patch = useCallback(async (body: Record<string, unknown>) => {
		const res = await apiFetch('/api/agent-sessions', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (!res.ok) throw new Error('Failed to update session');
		return res.json();
	}, []);

	const killLive = useCallback(async (sessionId: string) => {
		// Arrête le process SDK + tmux et marque completed côté agent (best-effort).
		try {
			await localFetch(`/agent-sessions/${encodeURIComponent(sessionId)}/kill`, {
				method: 'POST',
			});
		} catch {
			/* l'agent peut être offline ; le PATCH DB reste la vérité */
		}
	}, []);

	const stop = useCallback(
		async (sessionId: string) => {
			await killLive(sessionId);
			await patch({ session_id: sessionId, status: 'completed' });
			invalidate();
		},
		[killLive, patch, invalidate],
	);

	const resume = useCallback(
		async (sessionId: string) => {
			await patch({ session_id: sessionId, status: 'active', archived_at: null });
			invalidate();
		},
		[patch, invalidate],
	);

	const archive = useCallback(
		async (sessionId: string) => {
			await killLive(sessionId);
			await patch({
				session_id: sessionId,
				status: 'completed',
				archived_at: new Date().toISOString(),
			});
			invalidate();
		},
		[killLive, patch, invalidate],
	);

	const unarchive = useCallback(
		async (sessionId: string) => {
			await patch({ session_id: sessionId, archived_at: null });
			invalidate();
		},
		[patch, invalidate],
	);

	const remove = useCallback(
		async (rowId: string) => {
			const res = await apiFetch(`/api/agent-sessions?id=${encodeURIComponent(rowId)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete session');
			invalidate();
		},
		[invalidate],
	);

	return { stop, resume, archive, unarchive, remove };
}
