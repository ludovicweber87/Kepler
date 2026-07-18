'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAgentSseUrl } from '@/lib/local-fetch';
import { prependNotification } from '@/lib/notificationsReducer';
import { isNotificationSoundMuted, playNotificationChime } from '@/lib/notificationSound';
import { NOTIFICATIONS_QUERY_KEY } from '@/hooks/useNotifications';
import type { AppNotification } from '@/types';

/** Subscribes once to the agent's global notifications SSE stream and keeps
 * the `['notifications']` query cache in sync. Mount a single instance
 * (e.g. in AppShell) — EventSource has no auth header, matching the
 * server's unauthenticated `/notifications/stream` endpoint. */
export function useNotificationsStream(): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		const es = new EventSource(getAgentSseUrl());

		es.onmessage = (event) => {
			try {
				const incoming = JSON.parse(event.data) as AppNotification;
				queryClient.setQueryData<AppNotification[]>(NOTIFICATIONS_QUERY_KEY, (prev) =>
					prependNotification(prev ?? [], incoming),
				);
				// Le SSE ne pousse que les nouvelles notifs (pas de backlog au connect) → 1 son/notif.
				if (!isNotificationSoundMuted()) playNotificationChime();
			} catch {
				// Ignore malformed events (e.g. comment/ping lines already filtered by EventSource).
			}
		};

		es.onerror = () => {
			// EventSource auto-reconnects; resync in case we missed inserts while disconnected.
			queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
		};

		return () => es.close();
	}, [queryClient]);
}
