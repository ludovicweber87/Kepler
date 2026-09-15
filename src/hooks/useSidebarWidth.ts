'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { readStoredItem } from '@/lib/storage';
import { clampSidebarWidth, parseSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '@/lib/sidebarWidth';

const STORAGE_KEY = 'kepler-sidebar-width';
const CHANGE_EVENT = 'kepler-sidebar-width-change';

// Largeur courante mémoïsée. Le drag émet une valeur à chaque mousemove : relire
// (et surtout réécrire) localStorage à cette fréquence serait inutilement coûteux,
// et `getSnapshot` doit de toute façon rendre une valeur stable entre deux changements.
let cached: number | null = null;
// Drag en cours : le Header, qui suit la sidebar, doit couper sa transition CSS
// en même temps qu'elle — sinon il traîne visiblement derrière le curseur.
let dragging = false;

function subscribe(callback: () => void) {
	// Écriture venue d'un autre onglet : le cache local est périmé.
	const onStorage = () => {
		cached = parseSidebarWidth(readStoredItem(STORAGE_KEY));
		callback();
	};
	window.addEventListener('storage', onStorage);
	window.addEventListener(CHANGE_EVENT, callback);
	return () => {
		window.removeEventListener('storage', onStorage);
		window.removeEventListener(CHANGE_EVENT, callback);
	};
}

function getWidthSnapshot(): number {
	if (cached === null) cached = parseSidebarWidth(readStoredItem(STORAGE_KEY));
	return cached;
}

const getServerWidthSnapshot = (): number => SIDEBAR_WIDTH_DEFAULT;

const getDraggingSnapshot = (): boolean => dragging;
const getServerDraggingSnapshot = (): boolean => false;

/**
 * Largeur de la sidebar dépliée, redimensionnable à la souris. Même pattern que
 * `useSidebarCollapsed` : store externe synchrone sur localStorage, pas de Context —
 * le Header doit suivre la même largeur, et une lecture synchrone évite le saut de
 * largeur qu'imposerait un aller-retour HTTP au premier rendu.
 */
export function useSidebarWidth() {
	const width = useSyncExternalStore(subscribe, getWidthSnapshot, getServerWidthSnapshot);
	const resizing = useSyncExternalStore(
		subscribe,
		getDraggingSnapshot,
		getServerDraggingSnapshot,
	);

	/** `persist: false` pendant le drag : on n'écrit qu'au relâchement de la poignée. */
	const setWidth = useCallback((px: number, { persist = true }: { persist?: boolean } = {}) => {
		cached = clampSidebarWidth(px);
		if (persist) {
			// Best-effort : navigation privée ou quota plein ne doivent pas casser le drag.
			try {
				localStorage.setItem(STORAGE_KEY, String(cached));
			} catch {
				/* largeur conservée en mémoire pour la session */
			}
		}
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	const setResizing = useCallback((value: boolean) => {
		dragging = value;
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	return { width, resizing, setWidth, setResizing };
}
