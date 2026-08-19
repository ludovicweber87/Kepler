'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
	subscribeComposerDraft,
	getComposerDraft,
	setComposerDraft,
	getComposerAttachments,
	setComposerAttachments,
	clearComposerDraft,
	nextAttachmentId,
	NO_ATTACHMENTS,
} from '@/lib/composerDraft';
import type { ChatImageInput, ComposerAttachment } from '@/types';

const emptyText = () => '';
const emptyAttachments = () => NO_ATTACHMENTS;

/**
 * Brouillon du composer scopé à une session. Même pattern que `useSidebarCollapsed` :
 * store externe synchrone (localStorage pour le texte, mémoire pour les images), pas d'état
 * React local — le Workbench ne remonte pas le composer d'une session à l'autre, donc un
 * `useState` fuiterait le message d'un worktree dans l'autre.
 */
export function useComposerDraft(sessionId: string) {
	const text = useSyncExternalStore(
		subscribeComposerDraft,
		useCallback(() => getComposerDraft(sessionId), [sessionId]),
		emptyText,
	);

	const attachments = useSyncExternalStore(
		subscribeComposerDraft,
		useCallback(() => getComposerAttachments(sessionId), [sessionId]),
		emptyAttachments,
	);

	const setText = useCallback((value: string) => setComposerDraft(sessionId, value), [sessionId]);

	// Read-modify-write sur le store : la liste courante est lue à l'appel, jamais capturée.
	// Une image dont la lecture s'achève après un changement de session reste ainsi rattachée
	// à sa session d'origine.
	const addAttachment = useCallback(
		(image: ChatImageInput) => {
			const next: ComposerAttachment[] = [
				...getComposerAttachments(sessionId),
				{ ...image, id: nextAttachmentId() },
			];
			setComposerAttachments(sessionId, next);
		},
		[sessionId],
	);

	const removeAttachment = useCallback(
		(id: string) =>
			setComposerAttachments(
				sessionId,
				getComposerAttachments(sessionId).filter((a) => a.id !== id),
			),
		[sessionId],
	);

	const clear = useCallback(() => clearComposerDraft(sessionId), [sessionId]);

	return { text, setText, attachments, addAttachment, removeAttachment, clear };
}
