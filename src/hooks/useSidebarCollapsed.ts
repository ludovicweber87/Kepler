'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'devora-sidebar-collapsed';
const CHANGE_EVENT = 'devora-sidebar-collapsed-change';

/** Résout la valeur persistée : tout ce qui n'est pas exactement 'true' vaut déplié. */
export function resolveStoredCollapsed(stored: string | null): boolean {
	return stored === 'true';
}

function subscribe(callback: () => void) {
	window.addEventListener('storage', callback);
	window.addEventListener(CHANGE_EVENT, callback);
	return () => {
		window.removeEventListener('storage', callback);
		window.removeEventListener(CHANGE_EVENT, callback);
	};
}

const getSnapshot = (): boolean => resolveStoredCollapsed(localStorage.getItem(STORAGE_KEY));

const getServerSnapshot = (): boolean => false;

/**
 * Préférence « sidebar réduite ». Même pattern que `useColorMode` : store externe
 * synchrone sur localStorage, pas de Context — il n'y a pas d'état React à propager,
 * et une lecture synchrone évite le saut 260px → 64px d'un aller-retour HTTP.
 */
export function useSidebarCollapsed() {
	const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const setCollapsed = useCallback((value: boolean) => {
		localStorage.setItem(STORAGE_KEY, String(value));
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	const toggle = useCallback(() => {
		setCollapsed(!resolveStoredCollapsed(localStorage.getItem(STORAGE_KEY)));
	}, [setCollapsed]);

	return { collapsed, setCollapsed, toggle };
}
