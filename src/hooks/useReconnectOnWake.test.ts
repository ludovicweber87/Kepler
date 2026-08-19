import { test, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReconnectOnWake } from './useReconnectOnWake';

function setVisibility(state: 'visible' | 'hidden') {
	Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

afterEach(() => {
	setVisibility('visible');
	vi.useRealTimers();
});

test('reconnecte quand le socket est mort et l onglet redevient visible', () => {
	setVisibility('visible');
	const reconnect = vi.fn();
	renderHook(() => useReconnectOnWake(() => true, reconnect));
	act(() => document.dispatchEvent(new Event('visibilitychange')));
	expect(reconnect).toHaveBeenCalledTimes(1);
});

test('ne reconnecte pas si le socket est vivant', () => {
	setVisibility('visible');
	const reconnect = vi.fn();
	renderHook(() => useReconnectOnWake(() => false, reconnect));
	act(() => document.dispatchEvent(new Event('visibilitychange')));
	expect(reconnect).not.toHaveBeenCalled();
});

test('ne reconnecte pas quand l onglet est en arrière-plan', () => {
	setVisibility('hidden');
	const reconnect = vi.fn();
	renderHook(() => useReconnectOnWake(() => true, reconnect));
	act(() => window.dispatchEvent(new Event('online')));
	expect(reconnect).not.toHaveBeenCalled();
});

test('online déclenche aussi la reconnexion', () => {
	setVisibility('visible');
	const reconnect = vi.fn();
	renderHook(() => useReconnectOnWake(() => true, reconnect));
	act(() => window.dispatchEvent(new Event('online')));
	expect(reconnect).toHaveBeenCalledTimes(1);
});

test('anti-rafale : online + visibilitychange ne déclenchent qu une reconnexion', () => {
	vi.useFakeTimers();
	setVisibility('visible');
	const reconnect = vi.fn();
	renderHook(() => useReconnectOnWake(() => true, reconnect));
	act(() => {
		window.dispatchEvent(new Event('online'));
		document.dispatchEvent(new Event('visibilitychange'));
	});
	expect(reconnect).toHaveBeenCalledTimes(1);
});
