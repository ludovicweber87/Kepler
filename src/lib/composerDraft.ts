import type { ComposerAttachment } from '@/types';

const DRAFTS_KEY = 'devora.composerDrafts';
const CHANGE_EVENT = 'devora-composer-draft-change';
/** Au-delà, les brouillons les moins récemment édités sont évincés. */
const MAX_DRAFTS = 50;

type DraftEntry = { text: string; updatedAt: number };
type DraftMap = Record<string, DraftEntry>;

function readAll(): DraftMap {
	if (typeof window === 'undefined') return {};
	let parsed: unknown;
	try {
		const raw = window.localStorage.getItem(DRAFTS_KEY);
		if (!raw) return {};
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
	const out: DraftMap = {};
	for (const [sessionId, entry] of Object.entries(parsed as Record<string, unknown>)) {
		if (!entry || typeof entry !== 'object') continue;
		const { text, updatedAt } = entry as { text?: unknown; updatedAt?: unknown };
		if (typeof text !== 'string' || text === '') continue;
		out[sessionId] = { text, updatedAt: typeof updatedAt === 'number' ? updatedAt : 0 };
	}
	return out;
}

function writeAll(drafts: DraftMap): boolean {
	if (typeof window === 'undefined') return false;
	try {
		window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
		return true;
	} catch {
		return false;
	}
}

/** Garde les `MAX_DRAFTS` brouillons les plus récents. */
function evictOldest(drafts: DraftMap): DraftMap {
	const sessionIds = Object.keys(drafts);
	if (sessionIds.length <= MAX_DRAFTS) return drafts;
	const kept = sessionIds
		.sort((a, b) => drafts[b].updatedAt - drafts[a].updatedAt)
		.slice(0, MAX_DRAFTS);
	const out: DraftMap = {};
	for (const sessionId of kept) out[sessionId] = drafts[sessionId];
	return out;
}

function notify(): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** S'abonne aux changements de brouillon (pour `useSyncExternalStore`). */
export function subscribeComposerDraft(callback: () => void): () => void {
	window.addEventListener(CHANGE_EVENT, callback);
	return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/**
 * Repli si localStorage refuse l'écriture (quota, navigation privée) : la saisie doit rester
 * possible même sans persistance, puisque c'est le store qui alimente le champ.
 */
const unpersistedBySession = new Map<string, string>();

/** Brouillon texte de la session, `''` si aucun. SSR-safe. */
export function getComposerDraft(sessionId: string): string {
	return readAll()[sessionId]?.text ?? unpersistedBySession.get(sessionId) ?? '';
}

/** Persiste le brouillon texte d'une session. Un texte vide supprime l'entrée. SSR-safe. */
export function setComposerDraft(sessionId: string, text: string): void {
	const drafts = readAll();
	const known = sessionId in drafts || unpersistedBySession.has(sessionId);
	if (text === '') {
		if (!known) return;
		delete drafts[sessionId];
	} else {
		drafts[sessionId] = { text, updatedAt: Date.now() };
	}
	const persisted = writeAll(evictOldest(drafts));
	if (persisted || text === '') unpersistedBySession.delete(sessionId);
	else unpersistedBySession.set(sessionId, text);
	notify();
}

/**
 * Images en attente, gardées en mémoire et non en localStorage : ce sont des data URLs base64
 * qui feraient sauter le quota. Elles survivent au changement de session, pas au reload.
 */
const attachmentsBySession = new Map<string, ComposerAttachment[]>();
let attachmentSeq = 0;

/** Référence stable pour « aucune image » — requis par `useSyncExternalStore`. */
export const NO_ATTACHMENTS: readonly ComposerAttachment[] = Object.freeze([]);

/** Id d'attachement unique au sein du process — évite les collisions entre sessions. */
export function nextAttachmentId(): string {
	attachmentSeq += 1;
	return `a${attachmentSeq}`;
}

/** Images en attente pour cette session — référence stable tant que rien ne change. */
export function getComposerAttachments(sessionId: string): readonly ComposerAttachment[] {
	return attachmentsBySession.get(sessionId) ?? NO_ATTACHMENTS;
}

/** Mémorise les images en attente d'une session. Une liste vide supprime l'entrée. */
export function setComposerAttachments(
	sessionId: string,
	attachments: readonly ComposerAttachment[],
): void {
	if (attachments.length === 0) attachmentsBySession.delete(sessionId);
	else attachmentsBySession.set(sessionId, [...attachments]);
	notify();
}

/** Efface le brouillon complet (texte + images) d'une session, après envoi par exemple. */
export function clearComposerDraft(sessionId: string): void {
	attachmentsBySession.delete(sessionId);
	setComposerDraft(sessionId, '');
	notify();
}
