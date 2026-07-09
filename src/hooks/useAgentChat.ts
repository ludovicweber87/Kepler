'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getAgentWsUrl } from '@/lib/local-fetch';
import { reduceStreamEvent, userMessage } from '@/lib/chatReducer';
import type { ChatMessage, PendingPermission, PermissionDecision, StreamEventWire } from '@/types';

interface Params {
	sessionId: string;
	cwd: string | null;
	systemPrompt?: string;
	enabled: boolean;
	readOnly?: boolean;
	model?: string;
	effort?: string;
	permissionMode?: string;
}

type Status = 'connecting' | 'idle' | 'busy' | 'error' | 'closed';

export function useAgentChat(p: Params) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<Status>('connecting');
	const [model, setModelState] = useState(p.model ?? '');
	const [effort, setEffortState] = useState(p.effort ?? '');
	const [permissionMode, setPermState] = useState(p.permissionMode ?? '');
	const [pendingPermissions, setPending] = useState<PendingPermission[]>([]);
	const wsRef = useRef<WebSocket | null>(null);
	const lastSeqRef = useRef(0);
	const [, force] = useReducer((x) => x + 1, 0);
	const [reconnectNonce, setReconnectNonce] = useState(0);

	const applyWire = useCallback((wire: StreamEventWire) => {
		if (wire.seq <= lastSeqRef.current) return; // dédup exactly-once
		lastSeqRef.current = wire.seq;
		setMessages((prev) => reduceStreamEvent(prev, wire));
	}, []);

	useEffect(() => {
		if (!p.enabled || !p.cwd || p.readOnly) return;
		const ws = new WebSocket(getAgentWsUrl());
		wsRef.current = ws;
		lastSeqRef.current = 0;
		setStatus('connecting');
		setMessages([]);

		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					type: 'stream-init',
					sessionId: p.sessionId,
					cwd: p.cwd,
					systemPrompt: p.systemPrompt,
					model: p.model,
					effort: p.effort,
					permissionMode: p.permissionMode,
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
					setModelState(String(msg.model ?? ''));
					setEffortState(String(msg.effort ?? ''));
					setPermState(String(msg.permissionMode ?? ''));
					setPending((msg.pendingPermissions as PendingPermission[]) ?? []);
					setStatus(msg.busy ? 'busy' : 'idle');
					break;
				case 'stream-event':
					if (msg.event === 'result') setStatus('idle');
					else if (msg.event === 'session') {
						setModelState(
							String((msg.data as Record<string, unknown>)?.model ?? model),
						);
					} else setStatus('busy');
					applyWire(msg as unknown as StreamEventWire);
					break;
				case 'stream-permission-request':
					setPending((prev) => [...prev, msg as unknown as PendingPermission]);
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
	}, [p.enabled, p.cwd, p.readOnly, p.sessionId, reconnectNonce]);

	const sendCtl = useCallback(
		(obj: Record<string, unknown>) => {
			const ws = wsRef.current;
			if (ws && ws.readyState === 1)
				ws.send(JSON.stringify({ ...obj, sessionId: p.sessionId }));
		},
		[p.sessionId],
	);

	const send = useCallback(
		(text: string) => {
			const t = text.trim();
			if (!t) return;
			setMessages((prev) => [...prev, userMessage(t)]);
			setStatus('busy');
			sendCtl({ type: 'stream-user-message', text: t });
		},
		[sendCtl],
	);

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
	const interrupt = useCallback(() => sendCtl({ type: 'stream-interrupt' }), [sendCtl]);
	const reconnect = useCallback(() => setReconnectNonce((n) => n + 1), []);
	const resolvePermission = useCallback(
		(id: string, decision: PermissionDecision) => {
			setPending((prev) => prev.filter((x) => x.id !== id));
			sendCtl({ type: 'stream-permission-response', id, decision });
		},
		[sendCtl],
	);

	return {
		messages,
		status,
		model,
		effort,
		permissionMode,
		pendingPermissions,
		send,
		setModel,
		setEffort,
		setPermissionMode,
		interrupt,
		resolvePermission,
		reconnect,
	};
}
