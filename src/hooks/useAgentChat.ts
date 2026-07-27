'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getAgentWsUrl } from '@/lib/local-fetch';
import { useReconnectOnWake } from '@/hooks/useReconnectOnWake';
import { reduceStreamEvent } from '@/lib/chatReducer';
import type {
	ChatImageInput,
	ChatMessage,
	PendingPermission,
	PendingQuestion,
	PermissionDecision,
	QuestionAnswers,
	StreamEventWire,
} from '@/types';

interface Params {
	sessionId: string;
	cwd: string | null;
	systemPrompt?: string;
	enabled: boolean;
	readOnly?: boolean;
	model?: string;
	effort?: string;
	permissionMode?: string;
	/**
	 * Ref one-shot : quand `true` à l'ouverture du WS, on demande au serveur de
	 * relancer le dernier prompt user (reprise d'un run interrompu). Consommée
	 * (remise à `false`) au premier `stream-init` pour ne pas rejouer sur les
	 * simples reconnexions.
	 */
	resumeRetryRef?: { current: boolean };
	/**
	 * Attache un client observateur : si la session n'est plus vivante côté
	 * serveur, il rejoue le transcript persisté puis ferme, sans jamais créer
	 * de nouvelle session SDK. Utilisé par le chat de run (step actif).
	 */
	observeOnly?: boolean;
	/**
	 * Prompt initial auto-envoyé comme premier message utilisateur au démarrage
	 * d'une session lancée depuis une issue. Le serveur ne l'injecte qu'une fois
	 * (garde transcript vide), donc l'envoyer à chaque `stream-init` est sans risque.
	 */
	initialPrompt?: string;
	/**
	 * Chat sur une doc. Quand il est fourni, le `stream-init` n'envoie QUE ce
	 * `docId` : le serveur résout lui-même cwd, prompt système, outils, portail
	 * d'outils et périmètre depuis la ligne `docs`. Rien de ce qui porte une
	 * garantie ne transite par le client — c'est ce qui rend les guardrails
	 * infranchissables. `cwd` est alors inutile (passer `null`).
	 */
	docId?: string;
}

type Status = 'connecting' | 'idle' | 'busy' | 'error' | 'closed';

export interface QueuedMessage {
	id: string;
	text: string;
	images?: ChatImageInput[];
}

export function useAgentChat(p: Params) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<Status>('connecting');
	const [model, setModelState] = useState(p.model ?? '');
	const [effort, setEffortState] = useState(p.effort ?? '');
	const [permissionMode, setPermState] = useState(p.permissionMode ?? '');
	const [pendingPermissions, setPending] = useState<PendingPermission[]>([]);
	const [pendingQuestions, setQuestions] = useState<PendingQuestion[]>([]);
	const [queued, setQueued] = useState<QueuedMessage[]>([]);
	const wsRef = useRef<WebSocket | null>(null);
	const hasConnectedRef = useRef(false);
	const lastSeqRef = useRef(0);
	const statusRef = useRef<Status>('connecting');
	const queuedRef = useRef<QueuedMessage[]>([]);
	const queuedId = useRef(0);
	statusRef.current = status;
	queuedRef.current = queued;
	const [, force] = useReducer((x) => x + 1, 0);
	const [reconnectNonce, setReconnectNonce] = useState(0);

	const applyWire = useCallback((wire: StreamEventWire) => {
		if (wire.seq <= lastSeqRef.current) return; // dédup exactly-once
		lastSeqRef.current = wire.seq;
		setMessages((prev) => reduceStreamEvent(prev, wire));
	}, []);

	useEffect(() => {
		if (!p.enabled || (!p.cwd && !p.docId) || p.readOnly) return;
		const ws = new WebSocket(getAgentWsUrl());
		wsRef.current = ws;
		lastSeqRef.current = 0;
		setStatus('connecting');
		setMessages([]);
		setQueued([]);

		ws.onopen = () => {
			// Session doc : on n'envoie ni cwd, ni systemPrompt, ni réglages. Le
			// serveur recalcule même le sessionId depuis le docId et ignore le nôtre.
			if (p.docId) {
				ws.send(
					JSON.stringify({ type: 'stream-init', sessionId: p.sessionId, docId: p.docId }),
				);
				return;
			}
			const retryLastUser = p.resumeRetryRef?.current ?? false;
			if (p.resumeRetryRef) p.resumeRetryRef.current = false;
			ws.send(
				JSON.stringify({
					type: 'stream-init',
					sessionId: p.sessionId,
					cwd: p.cwd,
					systemPrompt: p.systemPrompt,
					model: p.model,
					effort: p.effort,
					permissionMode: p.permissionMode,
					retryLastUser,
					observeOnly: p.observeOnly,
					initialPrompt: p.initialPrompt,
				}),
			);
		};
		ws.onmessage = (e) => {
			let msg: Record<string, unknown>;
			try {
				msg = JSON.parse(e.data);
			} catch {
				return;
			}
			switch (msg.type) {
				case 'stream-history': {
					const events =
						(msg.events as { seq: number; event: Omit<StreamEventWire, 'seq'> }[]) ??
						[];
					for (const row of events) applyWire({ seq: row.seq, ...row.event });
					break;
				}
				case 'stream-ready':
					hasConnectedRef.current = true;
					setModelState(String(msg.model ?? ''));
					setEffortState(String(msg.effort ?? ''));
					setPermState(String(msg.permissionMode ?? ''));
					setPending((msg.pendingPermissions as PendingPermission[]) ?? []);
					setQuestions((msg.pendingQuestions as PendingQuestion[]) ?? []);
					setStatus(msg.busy ? 'busy' : 'idle');
					break;
				case 'stream-event':
					if (msg.event === 'result') setStatus('idle');
					else if (msg.event === 'session') {
						setModelState(
							String((msg.data as Record<string, unknown>)?.model ?? model),
						);
					} else if (msg.event === 'role_switch') {
						// Marqueur informatif : ne modifie pas l'etat busy/idle.
					} else setStatus('busy');
					applyWire(msg as unknown as StreamEventWire);
					break;
				case 'stream-permission-request':
					setPending((prev) => [...prev, msg as unknown as PendingPermission]);
					break;
				case 'stream-question-request':
					setQuestions((prev) => [...prev, msg as unknown as PendingQuestion]);
					break;
				case 'stream-error':
					setStatus('error');
					break;
				case 'stream-closed':
					setStatus('closed');
					break;
			}
			force();
		};
		ws.onerror = () => setStatus('error');
		ws.onclose = () => setStatus((s) => (s === 'error' ? s : 'closed'));

		return () => {
			ws.close();
			wsRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [p.enabled, p.cwd, p.docId, p.readOnly, p.sessionId, reconnectNonce]);

	const sendCtl = useCallback(
		(obj: Record<string, unknown>) => {
			const ws = wsRef.current;
			if (ws && ws.readyState === 1)
				ws.send(JSON.stringify({ ...obj, sessionId: p.sessionId }));
		},
		[p.sessionId],
	);

	const dispatchUserMessage = useCallback(
		(text: string, images?: ChatImageInput[]) => {
			// Pas d'ajout optimiste : le serveur persiste le tour user et le renvoie
			// (stream-event 'user'), source unique dédupliquée par seq.
			setStatus('busy');
			sendCtl({ type: 'stream-user-message', text, images });
		},
		[sendCtl],
	);

	const send = useCallback(
		(text: string, images?: ChatImageInput[]) => {
			const t = text.trim();
			if (!t && (!images || images.length === 0)) return;
			// L'agent lit les messages séquentiellement : envoyer en plein tour placerait
			// le message au milieu de la réponse en cours (seq). On empile côté client et
			// on dépile à `idle` (voir l'effet ci-dessous). Sinon, envoi direct.
			if (statusRef.current === 'idle' && queuedRef.current.length === 0)
				dispatchUserMessage(t, images);
			else setQueued((prev) => [...prev, { id: `q${queuedId.current++}`, text: t, images }]);
		},
		[dispatchUserMessage],
	);

	// Flush : dès que l'agent redevient idle, on envoie le prochain message en attente.
	useEffect(() => {
		if (status !== 'idle' || queued.length === 0) return;
		const [next, ...rest] = queued;
		setQueued(rest);
		dispatchUserMessage(next.text, next.images);
	}, [status, queued, dispatchUserMessage]);

	const cancelQueued = useCallback((id: string) => {
		setQueued((prev) => prev.filter((x) => x.id !== id));
	}, []);

	const setModel = useCallback(
		(m: string) => {
			setModelState(m);
			sendCtl({ type: 'stream-set-model', model: m });
		},
		[sendCtl],
	);
	const setEffort = useCallback(
		(e: string) => {
			setEffortState(e);
			sendCtl({ type: 'stream-set-effort', effort: e });
		},
		[sendCtl],
	);
	const setPermissionMode = useCallback(
		(m: string) => {
			setPermState(m);
			sendCtl({ type: 'stream-set-mode', permissionMode: m });
		},
		[sendCtl],
	);
	const setSystemPrompt = useCallback(
		(systemPrompt: string, personaName?: string) => {
			sendCtl({ type: 'stream-set-system-prompt', systemPrompt, personaName });
		},
		[sendCtl],
	);
	const interrupt = useCallback(() => {
		setStatus('idle'); // réactive le composer sans attendre le round-trip serveur
		sendCtl({ type: 'stream-interrupt' });
	}, [sendCtl]);
	const reconnect = useCallback(() => setReconnectNonce((n) => n + 1), []);

	// Reconnexion auto au réveil du laptop : si le socket est mort (fermé/en
	// fermeture) et que l'onglet redevient visible, on relance `startOrAttach`
	// côté serveur, qui rejoue le transcript persisté (rien de perdu).
	useReconnectOnWake(() => {
		if (!p.enabled || !p.cwd || p.readOnly) return false;
		const ws = wsRef.current;
		return !ws || ws.readyState > 1; // CLOSING (2) ou CLOSED (3)
	}, reconnect);
	const resolvePermission = useCallback(
		(id: string, decision: PermissionDecision) => {
			setPending((prev) => prev.filter((x) => x.id !== id));
			sendCtl({ type: 'stream-permission-response', id, decision });
		},
		[sendCtl],
	);
	const resolveQuestion = useCallback(
		(id: string, answers: QuestionAnswers) => {
			setQuestions((prev) => prev.filter((x) => x.id !== id));
			setStatus('busy');
			sendCtl({ type: 'stream-question-response', id, answers });
		},
		[sendCtl],
	);

	return {
		messages,
		status,
		// `connecting` alors qu'on a déjà été connecté = reconnexion en cours
		// (distinct de la toute première connexion).
		reconnecting: status === 'connecting' && hasConnectedRef.current,
		model,
		effort,
		permissionMode,
		pendingPermissions,
		pendingQuestions,
		queued,
		send,
		cancelQueued,
		setModel,
		setEffort,
		setPermissionMode,
		setSystemPrompt,
		interrupt,
		resolvePermission,
		resolveQuestion,
		reconnect,
	};
}
