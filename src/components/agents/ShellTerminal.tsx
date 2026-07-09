'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { getAgentWsUrl } from '@/lib/local-fetch';

interface ShellTerminalProps {
	sessionId: string;
	cwd: string | null;
	active: boolean;
	ready?: boolean;
}

export default function ShellTerminal({
	sessionId,
	cwd,
	active,
	ready = true,
}: ShellTerminalProps) {
	const [node, setNode] = useState<HTMLDivElement | null>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const initialized = useRef(false);

	// Init une seule fois quand tout est prêt et le panneau visible.
	useEffect(() => {
		if (!node || !active || !ready || !cwd) return;
		if (initialized.current) return;
		initialized.current = true;

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
			scrollback: 5000,
			theme: {
				background: '#1A1A1A',
				foreground: '#E0E0E0',
				cursor: '#00E5FF',
				selectionBackground: 'rgba(0, 229, 255, 0.3)',
				black: '#1A1A1A',
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
			},
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

		const shellSessionId = `${sessionId}-shell`;
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
	}, [node, active, ready, cwd, sessionId]);

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
}
