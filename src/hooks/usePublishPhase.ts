'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
	subscribePublishPhase,
	getPublishPhase,
	setPublishPhase,
	type PublishPhase,
} from '@/lib/publishReportState';

const idlePhase = (): PublishPhase => 'idle';

/**
 * Phase de publication du rapport pour une session donnée. Store externe plutôt que
 * `useState` : `AgentActivityTab` reste monté quand on change de worktree, donc un état
 * local ferait fuiter le spinner d'une session sur le bouton d'une autre. Deux sessions
 * peuvent ainsi publier en parallèle, chacune avec son propre bouton.
 */
export function usePublishPhase(sessionId: string) {
	const phase = useSyncExternalStore(
		subscribePublishPhase,
		useCallback(() => getPublishPhase(sessionId), [sessionId]),
		idlePhase,
	);

	// Le setter prend l'id en argument : une publication en vol doit pouvoir clore la phase
	// de *sa* session même si l'utilisateur a déjà basculé sur un autre worktree.
	const setPhase = useCallback((id: string, next: PublishPhase) => setPublishPhase(id, next), []);

	return {
		phase,
		setPhase,
		publishing: phase === 'publishing' || phase === 'synthesizing',
		synthesizing: phase === 'synthesizing',
		published: phase === 'published',
	};
}
