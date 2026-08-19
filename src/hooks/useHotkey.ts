'use client';

import { useEffect, useRef } from 'react';

/**
 * Raccourci global Cmd + `key`.
 *
 * Écoute sur `window` en phase de capture : xterm.js et le composer de chat posent
 * leurs propres handlers sur leurs éléments, la capture nous fait passer avant eux.
 *
 * Cmd uniquement, jamais Ctrl : Ctrl+B est le préfixe tmux et Ctrl+J un LF, or les
 * `ShellTerminal` attachent des sessions tmux. En capture on les volerait au PTY.
 */
export function useHotkey(key: string, handler: () => void, enabled = true) {
	// Le handler vit dans une ref pour ne pas ré-attacher le listener à chaque render.
	const handlerRef = useRef(handler);
	useEffect(() => {
		handlerRef.current = handler;
	}, [handler]);

	useEffect(() => {
		if (!enabled) return;
		const target = key.toLowerCase();
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.repeat || e.altKey || e.shiftKey || e.ctrlKey) return;
			if (!e.metaKey) return;
			if (e.key.toLowerCase() !== target) return;
			e.preventDefault();
			handlerRef.current();
		};
		window.addEventListener('keydown', onKeyDown, { capture: true });
		return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
	}, [key, enabled]);
}
