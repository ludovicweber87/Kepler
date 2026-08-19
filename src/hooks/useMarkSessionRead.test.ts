import { test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AppNotification } from '@/types';
import { useMarkSessionRead } from './useMarkSessionRead';

const markRead = vi.fn();
let notifications: AppNotification[] = [];

vi.mock('@/hooks/useNotifications', () => ({
	NOTIFICATIONS_QUERY_KEY: ['notifications'],
	useNotifications: () => ({ notifications, isLoading: false }),
}));
vi.mock('@/hooks/useMarkNotifications', () => ({
	useMarkNotifications: () => ({ markRead }),
}));

function notif(id: string, session: string, read = false): AppNotification {
	return {
		id,
		source: 'agent',
		type: 'agent_done',
		priority: 'normal',
		title: '',
		body: '',
		url: `/workbench?session=${session}`,
		entity_ref: { kind: 'session', id: session },
		payload: {},
		read_at: read ? '2026-07-26T10:00:00Z' : null,
		created_at: '2026-07-26T10:00:00Z',
	} as AppNotification;
}

function setVisibility(state: 'visible' | 'hidden') {
	Object.defineProperty(document, 'visibilityState', {
		configurable: true,
		get: () => state,
	});
}

beforeEach(() => {
	markRead.mockClear();
	notifications = [];
	setVisibility('visible');
});

test('marque lues les notifs de la session affichée quand l onglet est visible', () => {
	notifications = [notif('n1', 's1'), notif('n2', 's1')];
	renderHook(() => useMarkSessionRead('s1'));
	expect(markRead).toHaveBeenCalledWith(['n1', 'n2']);
});

test('ignore les notifs des autres sessions', () => {
	notifications = [notif('n1', 'other')];
	renderHook(() => useMarkSessionRead('s1'));
	expect(markRead).not.toHaveBeenCalled();
});

test('no-op sans sessionId, sans notif, ou si déjà lue', () => {
	notifications = [notif('n1', 's1')];
	renderHook(() => useMarkSessionRead(undefined));
	expect(markRead).not.toHaveBeenCalled();

	notifications = [notif('n1', 's1', true)];
	renderHook(() => useMarkSessionRead('s1'));
	expect(markRead).not.toHaveBeenCalled();
});

test('attend le retour de l onglet quand il est caché', () => {
	setVisibility('hidden');
	notifications = [notif('n1', 's1')];
	renderHook(() => useMarkSessionRead('s1'));
	expect(markRead).not.toHaveBeenCalled();

	setVisibility('visible');
	act(() => {
		document.dispatchEvent(new Event('visibilitychange'));
	});
	expect(markRead).toHaveBeenCalledWith(['n1']);
});

test('ne retente pas un id déjà tenté (échec du PATCH → cache restauré)', () => {
	notifications = [notif('n1', 's1')];
	const { rerender } = renderHook(() => useMarkSessionRead('s1'));
	expect(markRead).toHaveBeenCalledTimes(1);

	// Le PATCH a échoué : onError restaure le cache, la notif redevient non-lue.
	notifications = [notif('n1', 's1')];
	rerender();
	expect(markRead).toHaveBeenCalledTimes(1);
});

test('marque une nouvelle notif arrivée pendant que la session est ouverte', () => {
	notifications = [notif('n1', 's1')];
	const { rerender } = renderHook(() => useMarkSessionRead('s1'));
	expect(markRead).toHaveBeenCalledWith(['n1']);

	notifications = [notif('n1', 's1', true), notif('n2', 's1')];
	rerender();
	expect(markRead).toHaveBeenLastCalledWith(['n2']);
});
