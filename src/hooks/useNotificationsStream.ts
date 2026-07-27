'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getAgentSseUrl } from '@/lib/local-fetch';
import { prependNotification, titleFor } from '@/lib/notificationsReducer';
import { isNotificationSoundMuted, playNotificationChime } from '@/lib/notificationSound';
import { showOsNotification } from '@/lib/osNotification';
import { NOTIFICATIONS_QUERY_KEY } from '@/hooks/useNotifications';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { AppNotification } from '@/types';

/** Subscribes once to the agent's global notifications SSE stream and keeps
 * the `['notifications']` query cache in sync. Mount a single instance
 * (e.g. in AppShell) — EventSource has no auth header, matching the
 * server's unauthenticated `/notifications/stream` endpoint. */
export function useNotificationsStream(): void {
	const queryClient = useQueryClient();
	const router = useRouter();
	const { showSnackbar } = useSnackbar();
	const t = useTranslations('notifications');

	// Refs pour garder les derniers handlers sans re-souscrire l'EventSource à chaque render.
	const handlersRef = useRef({ router, showSnackbar, t });
	useEffect(() => {
		handlersRef.current = { router, showSnackbar, t };
	});

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
				// Snackbar de fin d'agent / de question posée, visible quelle que soit la page ouverte.
				if (
					incoming.type === 'agent_done' ||
					incoming.type === 'agent_error' ||
					incoming.type === 'agent_blocked'
				) {
					const { router: r, showSnackbar: snack, t: translate } = handlersRef.current;
					const title = titleFor(incoming, (k, v) => translate(k, v));
					const severity =
						incoming.type === 'agent_error'
							? 'error'
							: incoming.type === 'agent_blocked'
								? 'info'
								: 'success';
					const url = incoming.url;
					const onClick = url?.startsWith('/') ? () => r.push(url) : undefined;
					snack(title, severity, onClick ? { onClick } : undefined);
					// Notification système : no-op si la pref est coupée, la permission
					// non accordée, ou si l'onglet a déjà le focus.
					showOsNotification(title, { tag: incoming.id, onClick });
				}
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
