import { test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgentChat } from './useAgentChat';

// Mock WebSocket minimal contrôlable.
class MockWS {
	static last: MockWS;
	onopen: (() => void) | null = null;
	onmessage: ((e: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	readyState = 0;
	sent: string[] = [];
	constructor(public url: string) {
		MockWS.last = this;
	}
	send(d: string) {
		this.sent.push(d);
	}
	close() {
		this.readyState = 3;
		this.onclose?.();
	}
	_open() {
		this.readyState = 1;
		this.onopen?.();
	}
	_emit(obj: unknown) {
		this.onmessage?.({ data: JSON.stringify(obj) });
	}
}
beforeEach(() => {
	vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket);
});

const params = { sessionId: 's1', cwd: '/tmp', enabled: true };

test('envoie stream-init à l ouverture', async () => {
	renderHook(() => useAgentChat(params));
	act(() => MockWS.last._open());
	const init = MockWS.last.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'stream-init');
	expect(init).toMatchObject({ sessionId: 's1', cwd: '/tmp' });
});

test('stream-history initialise les messages', async () => {
	const { result } = renderHook(() => useAgentChat(params));
	act(() => {
		MockWS.last._open();
		MockWS.last._emit({
			type: 'stream-history',
			events: [{ seq: 1, event: { event: 'assistant', data: { text: 'salut' } } }],
		});
	});
	await waitFor(() => expect(result.current.messages).toHaveLength(1));
});

test('dédup par seq : un event déjà vu en history n est pas réappliqué', async () => {
	const { result } = renderHook(() => useAgentChat(params));
	act(() => {
		MockWS.last._open();
		MockWS.last._emit({
			type: 'stream-history',
			events: [{ seq: 1, event: { event: 'assistant', data: { text: 'A' } } }],
		});
		MockWS.last._emit({
			type: 'stream-event',
			seq: 1,
			event: 'assistant',
			data: { text: 'A' },
		}); // doublon live
		MockWS.last._emit({
			type: 'stream-event',
			seq: 2,
			event: 'assistant',
			data: { text: 'B' },
		});
	});
	await waitFor(() =>
		expect(result.current.messages[0].segments).toEqual([
			{ kind: 'text', text: 'A' },
			{ kind: 'text', text: 'B' },
		]),
	);
});

test('send ajoute une bulle user optimiste + envoie stream-user-message', async () => {
	const { result } = renderHook(() => useAgentChat(params));
	act(() => MockWS.last._open());
	act(() => result.current.send('go'));
	expect(result.current.messages.at(-1)).toMatchObject({ role: 'user' });
	const um = MockWS.last.sent
		.map((s) => JSON.parse(s))
		.find((m) => m.type === 'stream-user-message');
	expect(um).toMatchObject({ text: 'go' });
});

test('reconnect() ferme la connexion existante et en ouvre une nouvelle', async () => {
	const { result } = renderHook(() => useAgentChat(params));
	act(() => MockWS.last._open());
	const firstWs = MockWS.last;
	act(() => result.current.reconnect());
	expect(firstWs.readyState).toBe(3); // fermée par le teardown de l'effet
	expect(MockWS.last).not.toBe(firstWs);
	act(() => MockWS.last._open());
	const init = MockWS.last.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'stream-init');
	expect(init).toMatchObject({ sessionId: 's1', cwd: '/tmp' });
});

test('permission request puis resolve', async () => {
	const { result } = renderHook(() => useAgentChat(params));
	act(() => {
		MockWS.last._open();
		MockWS.last._emit({
			type: 'stream-permission-request',
			id: 'p1',
			toolName: 'Bash',
			input: {},
		});
	});
	await waitFor(() => expect(result.current.pendingPermissions).toHaveLength(1));
	act(() => result.current.resolvePermission('p1', 'allow-once'));
	expect(result.current.pendingPermissions).toHaveLength(0);
	const resp = MockWS.last.sent
		.map((s) => JSON.parse(s))
		.find((m) => m.type === 'stream-permission-response');
	expect(resp).toMatchObject({ id: 'p1', decision: 'allow-once' });
});
