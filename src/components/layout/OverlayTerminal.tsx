'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { useOverlayTerminal } from '@/hooks/useOverlayTerminal';
import { getAgentWsUrl } from '@/lib/local-fetch';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

const OVERLAY_W = 560;
const OVERLAY_H = 340;

export default function OverlayTerminal() {
	const theme = useTheme();
	const { session, close } = useOverlayTerminal();
	const [termNode, setTermNode] = useState<HTMLDivElement | null>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);

	// Drag state
	const [pos, setPos] = useState({
		x: 32,
		y: typeof window !== 'undefined' ? window.innerHeight - OVERLAY_H - 32 : 400,
	});
	const dragging = useRef(false);
	const dragOffset = useRef({ x: 0, y: 0 });

	// Expand back to full modal
	const [expanded, setExpanded] = useState(false);

	// Reset position when session changes
	const prevSessionId = useRef(session?.sessionId);
	if (session?.sessionId !== prevSessionId.current) {
		prevSessionId.current = session?.sessionId;
		if (session) {
			setPos({
				x: 32,
				y: typeof window !== 'undefined' ? window.innerHeight - OVERLAY_H - 32 : 400,
			});
			setExpanded(false);
		}
	}

	// Terminal setup
	useEffect(() => {
		if (!session || !termNode || expanded) return;

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 12,
			fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
			theme: {
				background: theme.palette.background.default,
				foreground: theme.palette.text.primary,
				cursor: theme.palette.primary.main,
				selectionBackground: alpha(theme.palette.primary.main, 0.3),
			},
			allowProposedApi: true,
		});

		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(termNode);
		try {
			terminal.loadAddon(new WebglAddon());
		} catch {
			/* fallback */
		}

		requestAnimationFrame(() => {
			fitAddon.fit();
		});

		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;

		const ws = new WebSocket(getAgentWsUrl());
		wsRef.current = ws;

		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					type: 'init',
					sessionId: session.sessionId,
					cwd: session.projectPath,
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
			terminal.write('\r\n\x1b[90m[disconnected]\x1b[0m\r\n');
		};

		terminal.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'input', data }));
			}
		});

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
		observer.observe(termNode);

		return () => {
			if (resizeTimer) clearTimeout(resizeTimer);
			observer.disconnect();
			ws.close();
			terminal.dispose();
			terminalRef.current = null;
			wsRef.current = null;
			fitAddonRef.current = null;
		};
	}, [session, termNode, expanded]);

	// Drag handlers
	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			dragging.current = true;
			dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
			e.preventDefault();

			const handleMouseMove = (ev: MouseEvent) => {
				if (!dragging.current) return;
				setPos({
					x: Math.max(
						0,
						Math.min(window.innerWidth - OVERLAY_W, ev.clientX - dragOffset.current.x),
					),
					y: Math.max(
						64,
						Math.min(window.innerHeight - 40, ev.clientY - dragOffset.current.y),
					),
				});
			};

			const handleMouseUp = () => {
				dragging.current = false;
				document.removeEventListener('mousemove', handleMouseMove);
				document.removeEventListener('mouseup', handleMouseUp);
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
			};

			document.body.style.cursor = 'grabbing';
			document.body.style.userSelect = 'none';
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
		},
		[pos],
	);

	if (!session) return null;

	// When expanded, show full modal and hide overlay
	if (expanded) {
		return (
			<AgentTerminalModal
				open
				onClose={() => setExpanded(false)}
				projectPath={session.projectPath}
				existingSessionId={session.sessionId}
			/>
		);
	}

	return (
		<Box
			sx={{
				position: 'fixed',
				left: pos.x,
				top: pos.y,
				width: OVERLAY_W,
				height: OVERLAY_H,
				zIndex: 1400,
				borderRadius: 1,
				overflow: 'hidden',
				border: 1,
				borderColor: alpha(theme.palette.primary.main, 0.3),
				boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.5)}`,
				display: 'flex',
				flexDirection: 'column',
				bgcolor: 'background.default',
			}}
		>
			{/* Title bar — draggable */}
			<Box
				onMouseDown={handleMouseDown}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.75,
					px: 1,
					py: 0.5,
					bgcolor: 'background.paper',
					cursor: 'grab',
					flexShrink: 0,
					borderBottom: 1,
					borderColor: alpha(theme.palette.common.white, 0.06),
					'&:active': { cursor: 'grabbing' },
				}}
			>
				<DragIndicatorRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
				<SmartToyRoundedIcon sx={{ fontSize: 13, color: 'primary.main' }} />
				<Typography
					variant="caption"
					sx={{
						flex: 1,
						fontSize: '0.68rem',
						fontWeight: 600,
						color: 'text.secondary',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{session.projectName}
				</Typography>
				<IconButton
					size="small"
					onClick={() => setExpanded(true)}
					sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'text.primary' } }}
				>
					<OpenInFullRoundedIcon sx={{ fontSize: 14 }} />
				</IconButton>
				<IconButton
					size="small"
					onClick={close}
					sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'error.main' } }}
				>
					<CloseRoundedIcon sx={{ fontSize: 14 }} />
				</IconButton>
			</Box>

			{/* Terminal */}
			<Box
				ref={setTermNode}
				sx={{
					flex: 1,
					'& .xterm': { height: '100%', p: 0.5 },
					'& .xterm-viewport': {
						'&::-webkit-scrollbar': { width: 4 },
						'&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 1 },
					},
				}}
			/>
		</Box>
	);
}
