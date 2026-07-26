'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { useMarkNotifications } from '@/hooks/useMarkNotifications';
import { unreadAgentIdsBySession } from '@/lib/notificationsReducer';

/**
 * Marque lues les notifs d'agent de la session affichée : si le chat est à l'écran, la
 * pastille rouge n'a pas de sens. Couvre tous les chemins d'ouverture (clic sidebar, URL
 * directe, lien du snackbar, auto-focus) et les notifs qui arrivent par SSE pendant que la
 * session est déjà ouverte.
 *
 * Rien n'est marqué tant que l'onglet est caché : la pastille reste alors le signal
 * « il s'est passé quelque chose pendant ton absence », et s'éteint au retour.
 */
export function useMarkSessionRead(sessionId?: string) {
	const { notifications } = useNotifications();
	const { markRead } = useMarkNotifications();

	const unreadIds = useMemo(() => {
		if (!sessionId) return [];
		return unreadAgentIdsBySession(notifications).get(sessionId) ?? [];
	}, [notifications, sessionId]);

	// Un échec du PATCH restaure le cache, donc `unreadIds` redevient non-vide et l'effet
	// retenterait en boucle. On borne à un essai par id et par montage.
	const attempted = useRef<Set<string>>(new Set());

	useEffect(() => {
		const pending = unreadIds.filter((id) => !attempted.current.has(id));
		if (!pending.length) return;

		const flush = () => {
			if (document.visibilityState !== 'visible') return false;
			pending.forEach((id) => attempted.current.add(id));
			markRead(pending);
			return true;
		};

		if (flush()) return;

		const onVisibilityChange = () => {
			if (flush()) document.removeEventListener('visibilitychange', onVisibilityChange);
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => document.removeEventListener('visibilitychange', onVisibilityChange);
	}, [unreadIds, markRead]);
}
