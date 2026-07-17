'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { getAgentWsUrl } from '@/lib/local-fetch';
import { useThemePrefs } from '@/hooks/useThemePrefs';
import { terminalFontStack } from '@/lib/themePrefs';

interface ShellTerminalProps {
	/** Nom de la session tmux à créer/attacher (unique par terminal). */
	shellSessionId: string;
	cwd: string | null;
	active: boolean;
	ready?: boolean;
}

export interface ShellTerminalHandle {
	runCommand: (cmd: string) => void;
	/** Tue la session tmux sous-jacente (utilisé à la fermeture d'un onglet). */
	kill: () => void;
}

const ShellTerminal = forwardRef<ShellTerminalHandle, ShellTerminalProps>(function ShellTerminal(
	{ shellSessionId, cwd, active, ready = true },
	ref,
) {
	const theme = useTheme();
	const { prefs } = useThemePrefs();
	const [node, setNode] = useState<HTMLDivElement | null>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const initialized = useRef(false);

	// Thème xterm dérivé du thème MUI (suit le mode clair/sombre choisi).
	const xtermTheme = useMemo(
		() => ({
			background: theme.palette.background.default,
			foreground: theme.palette.text.primary,
			cursor: theme.palette.primary.main,
			selectionBackground: alpha(theme.palette.primary.main, 0.3),
			red: '#FF5252',
			green: '#69F0AE',
			yellow: '#FFD740',
			blue: '#448AFF',
			magenta: '#E040FB',
			cyan: '#00E5FF',
			white: '#E0E0E0',
			brightBlack: '#616161',
			brightRed: '#FF8A80',
			brightGreen: '#B9F6CA',
			brightYellow: '#FFE57F',
			brightBlue: '#82B1FF',
			brightMagenta: '#EA80FC',
			brightCyan: '#84FFFF',
			brightWhite: '#FFFFFF',
			black: '#1A1A1A',
		}),
		[theme.palette.background.default, theme.palette.text.primary, theme.palette.primary.main],
	);
	// Thème initial figé au montage (le terminal n'est créé qu'une fois) ;
	// les changements de mode ultérieurs sont appliqués par l'effet dédié plus bas.
	const xtermThemeRef = useRef(xtermTheme);

	useImperativeHandle(ref, () => ({
		runCommand: (cmd: string) => {
			const ws = wsRef.current;
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'input', data: cmd + '\r' }));
			}
		},
		kill: () => {
			const ws = wsRef.current;
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'kill', sessionId: shellSessionId }));
			}
		},
	}));

	// Init une seule fois au montage (les terminaux sont toujours montés actifs).
	// On ne détruit qu'au unmount : un onglet inactif reste connecté, scrollback préservé.
	useEffect(() => {
		if (!node || !ready || !cwd) return;
		if (initialized.current) return;
		initialized.current = true;

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: prefs.terminalFontSize,
			fontFamily: terminalFontStack(prefs.terminalFont),
			scrollback: 5000,
			theme: xtermThemeRef.current,
			allowProposedApi: true,
		});

		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(node);
		try {
			terminal.loadAddon(new WebglAddon());
		} catch {
			/* fallback canvas */
		}

		requestAnimationFrame(() => {
			fitAddon.fit();
			terminal.focus();
		});

		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;

		const ws = new WebSocket(getAgentWsUrl());
		wsRef.current = ws;

		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					type: 'init',
					sessionId: shellSessionId,
					cwd,
					cols: terminal.cols,
					rows: terminal.rows,
				}),
			);
		};

		ws.onmessage = (event) => {
			if (typeof event.data === 'string') {
				try {
					const msg = JSON.parse(event.data);
					if (msg.type === 'init-ack') return;
				} catch {
					/* terminal output */
				}
				terminal.write(event.data);
			}
		};

		ws.onclose = () => {
			terminal.write('\r\n\x1b[90m[Shell disconnected]\x1b[0m\r\n');
		};

		terminal.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'input', data }));
			}
		});

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (ws.readyState !== WebSocket.OPEN) return;
			const lines = Math.max(1, Math.round(Math.abs(e.deltaY) / 40));
			const button = e.deltaY < 0 ? 64 : 65;
			const seq = `\x1b[<${button};1;1M`;
			for (let i = 0; i < lines; i++) {
				ws.send(JSON.stringify({ type: 'input', data: seq }));
			}
		};
		node.addEventListener('wheel', handleWheel, { passive: false });

		let resizeTimer: ReturnType<typeof setTimeout> | null = null;
		const observer = new ResizeObserver(() => {
			if (resizeTimer) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				fitAddon.fit();
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(
						JSON.stringify({
							type: 'resize',
							cols: terminal.cols,
							rows: terminal.rows,
						}),
					);
				}
			}, 100);
		});
		observer.observe(node);

		return () => {
			node.removeEventListener('wheel', handleWheel);
			if (resizeTimer) clearTimeout(resizeTimer);
			observer.disconnect();
			ws.close();
			terminal.dispose();
			terminalRef.current = null;
			wsRef.current = null;
			fitAddonRef.current = null;
			initialized.current = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [node, ready, cwd, shellSessionId]);

	// Applique le thème à la volée quand le mode clair/sombre change,
	// sans recréer le terminal (préserve scrollback & connexion).
	useEffect(() => {
		const term = terminalRef.current;
		if (term) term.options.theme = xtermTheme;
	}, [xtermTheme]);

	// Applique police/taille à la volée quand les préférences changent.
	useEffect(() => {
		const term = terminalRef.current;
		if (!term) return;
		term.options.fontFamily = terminalFontStack(prefs.terminalFont);
		term.options.fontSize = prefs.terminalFontSize;
		fitAddonRef.current?.fit();
	}, [prefs.terminalFont, prefs.terminalFontSize]);

	// Refit + focus quand le panneau (re)devient visible.
	useEffect(() => {
		if (active) {
			requestAnimationFrame(() => {
				fitAddonRef.current?.fit();
				terminalRef.current?.focus();
			});
		}
	}, [active]);

	return (
		<Box
			onWheel={(e) => e.stopPropagation()}
			sx={{
				flex: 1,
				minHeight: 0,
				overflow: 'hidden',
				display: 'flex',
				alignItems: 'stretch',
				bgcolor: 'background.default',
				'& .xterm': { height: '100%', p: 1 },
				'& .xterm-viewport': {
					overflowY: 'scroll !important',
					'&::-webkit-scrollbar': { width: 6 },
					'&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 },
				},
			}}
		>
			<Box ref={setNode} sx={{ flex: 1, display: 'flex' }} />
		</Box>
	);
});

ShellTerminal.displayName = 'ShellTerminal';

export default ShellTerminal;
