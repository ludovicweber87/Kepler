'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import DraggableTabs from '@/components/shared/DraggableTabs';
import type { TabItem } from '@/components/shared/DraggableTabs';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PictureInPictureAltRoundedIcon from '@mui/icons-material/PictureInPictureAltRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import DifferenceRoundedIcon from '@mui/icons-material/DifferenceRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import type { AgentFile } from '@/hooks/useAgentFiles';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useAgentSession } from '@/hooks/useAgentSession';
import { useOverlayTerminal } from '@/hooks/useOverlayTerminal';
import AgentActivityTab from './AgentActivityTab';
import AgentDiffTab from './AgentDiffTab';
import AgentIssueTab from './AgentIssueTab';

interface IssueContext {
	owner: string;
	repo: string;
	issueNumber: number;
	issueTitle: string;
	labels?: string[];
}

interface AgentTerminalModalProps {
	open: boolean;
	onClose: () => void;
	/** Direct project path (agents/skills) */
	projectPath?: string;
	agentFile?: AgentFile;
	/** Attach to an existing tmux session by ID */
	existingSessionId?: string;
	/** Issue context — resolves projectPath via repo_paths */
	issueContext?: IssueContext;
	/** Session is from history (completed/error) — show reopen button first */
	isPastSession?: boolean;
}

function buildBranchName(issueContext: IssueContext): string {
	const labels = (issueContext.labels ?? []).map((l) => l.toLowerCase());
	let prefix = 'feat';
	if (labels.some((l) => l.includes('bug') || l.includes('fix'))) prefix = 'fix';
	else if (labels.some((l) => l.includes('refactor'))) prefix = 'refactor';
	else if (labels.some((l) => l.includes('docs') || l.includes('documentation'))) prefix = 'docs';
	else if (labels.some((l) => l.includes('chore'))) prefix = 'chore';
	else if (labels.some((l) => l.includes('test'))) prefix = 'test';
	else if (labels.some((l) => l.includes('perf') || l.includes('performance'))) prefix = 'perf';

	const slug = issueContext.issueTitle
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 50);

	// Timestamp suffix (MMDD + 1 random char) pour garantir l'unicité
	const now = new Date();
	const mm = String(now.getMonth() + 1).padStart(2, '0');
	const dd = String(now.getDate()).padStart(2, '0');
	const rand = Math.random().toString(36).charAt(2);
	const suffix = `${mm}${dd}${rand}`;

	return `${prefix}/${issueContext.issueNumber}-${slug}-${suffix}`;
}

function buildSessionId(
	projectPath?: string,
	agentFile?: AgentFile,
	issueContext?: IssueContext,
): string {
	const uid = Date.now().toString(36);
	if (issueContext) {
		return `devora-${issueContext.owner}-${issueContext.repo}-${issueContext.issueNumber}-${uid}`;
	}
	const base = projectPath?.replace(/[^a-zA-Z0-9]/g, '-') ?? 'unknown';
	const suffix =
		agentFile?.filename?.replace(/\.md$/, '').replace(/[^a-zA-Z0-9]/g, '-') ?? 'session';
	return `devora-${base}-${suffix}-${uid}`;
}

function buildReportingPrompt(sessionId: string): string {
	const logEndpoint = `http://localhost:4000/api/agent-sessions/log`;

	return [
		'',
		'## Activity Reporting',
		'',
		"Tu DOIS reporter ton activité en continu via l'API ci-dessous. Chaque log est une synthèse concise (1-2 phrases) de ce que tu viens de faire.",
		'',
		`Endpoint : POST ${logEndpoint}`,
		`Payload JSON : { "sessionId": "${sessionId}", "content": "<MESSAGE>", "logType": "<TYPE>" }`,
		'',
		'### Titre de session (OBLIGATOIRE en premier) :',
		'Dès que tu comprends la tâche, envoie IMMÉDIATEMENT un log de type `title` avec un résumé court (3-5 mots) de la tâche :',
		'```bash',
		`curl -s -X POST ${logEndpoint} \\`,
		'  -H "Content-Type: application/json" \\',
		`  -d '{"sessionId": "${sessionId}", "content": "<TITRE COURT 3-5 mots>", "logType": "title"}'`,
		'```',
		'Exemples de bons titres : "Refactor auth middleware", "Fix sidebar scroll bug", "Add dark mode toggle"',
		'',
		'### Types de logs et quand les utiliser :',
		"- **info** : décisions prises, début d'analyse, changement d'approche",
		'- **file_change** : fichiers créés/modifiés/supprimés (lister les fichiers)',
		'- **commit** : quand tu fais un commit (inclure le message de commit)',
		'- **error** : erreurs rencontrées, blocages',
		'- **summary** : uniquement à la FIN de ta tâche, rapport structuré (voir format ci-dessous)',
		'',
		'### Format du summary final :',
		'Le summary DOIT suivre ce format structuré en markdown :',
		'',
		'```',
		'## Ce qui a été fait',
		'- Point 1',
		'- Point 2',
		'',
		'## Fichiers modifiés',
		'- `path/to/file.ts` : description courte du changement',
		'',
		'## Décisions techniques',
		'- Décision prise et pourquoi (si applicable)',
		'',
		'## Reste à faire',
		'- Ce qui manque ou nécessite une review (si applicable, sinon "Rien")',
		'```',
		'',
		'### Règles :',
		'1. Envoie un log **après chaque action significative** (pas avant, après)',
		'2. Pour le summary final, ajoute `"branch": "<BRANCHE>"` et `"status": "completed"` (ou `"error"`)',
		'3. Sois concis : pas de blabla, juste les faits',
		'4. Le summary DOIT être exhaustif — liste TOUS les fichiers modifiés et TOUTES les décisions prises',
		'',
		'### Exemple de log :',
		'```bash',
		`curl -s -X POST ${logEndpoint} \\`,
		'  -H "Content-Type: application/json" \\',
		`  -d '{"sessionId": "${sessionId}", "content": "Modifié src/components/Header.tsx : ajout du bouton de navigation", "logType": "file_change"}'`,
		'```',
	].join('\n');
}

export default function AgentTerminalModal({
	open,
	onClose,
	projectPath: projectPathProp,
	agentFile,
	existingSessionId,
	issueContext,
	isPastSession = false,
}: AgentTerminalModalProps) {
	// Claude terminal refs
	const [termNode, setTermNode] = useState<HTMLDivElement | null>(null);
	const [resumed, setResumed] = useState(false);
	const [activeTab, setActiveTab] = useState(0);
	const [termTabOrder, setTermTabOrder] = useState<string[] | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	// worktreePath is no longer managed by us — Claude handles it via --worktree
	const isStreamingRef = useRef(false);
	const terminalRef = useRef<Terminal | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const readyRef = useRef(false);

	// Plain shell terminal refs (tab 2)
	const [shellTermNode, setShellTermNode] = useState<HTMLDivElement | null>(null);
	const shellTerminalRef = useRef<Terminal | null>(null);
	const shellWsRef = useRef<WebSocket | null>(null);
	const shellFitAddonRef = useRef<FitAddon | null>(null);
	const shellInitialized = useRef(false);

	// Path resolution for issue context
	const { getLocalPath, savePath } = useRepoPaths();
	const [resolvedPath, setResolvedPath] = useState<string | null>(null);
	const [picking, setPicking] = useState(false);

	const projectPath = projectPathProp ?? resolvedPath;
	const generatedIdRef = useRef<string | null>(null);
	if (open && !existingSessionId && !generatedIdRef.current) {
		generatedIdRef.current = buildSessionId(projectPath ?? undefined, agentFile, issueContext);
	}
	if (!open) {
		generatedIdRef.current = null;
	}
	const sessionId = existingSessionId ?? generatedIdRef.current ?? '';

	const { session, logs, ensureSession } = useAgentSession(open ? sessionId : undefined);
	const overlay = useOverlayTerminal();

	const handlePip = useCallback(() => {
		if (!sessionId || !projectPath) return;
		const projectName = projectPath.split('/').filter(Boolean).pop() ?? 'unknown';
		overlay.open({ sessionId, projectPath, projectName, isPastSession });
		onClose();
	}, [sessionId, projectPath, isPastSession, overlay, onClose]);

	// Resolve path from repo_paths when using issueContext
	const resolveCwd = useCallback(async () => {
		if (!issueContext) return;
		const repoFullName = `${issueContext.owner}/${issueContext.repo}`;
		const saved = getLocalPath(repoFullName);
		if (saved) {
			setResolvedPath(saved);
			return;
		}
		setPicking(true);
		try {
			const res = await fetch('/api/filesystem/pick-directory');
			const { path } = await res.json();
			if (path) {
				savePath(repoFullName, path);
				setResolvedPath(path);
			} else {
				onClose();
			}
		} catch {
			onClose();
		} finally {
			setPicking(false);
		}
	}, [issueContext, getLocalPath, savePath, onClose]);

	useEffect(() => {
		if (open && issueContext && !resolvedPath) {
			resolveCwd();
		}
	}, [open, issueContext, resolvedPath, resolveCwd]);

	// Reset state on close
	useEffect(() => {
		if (!open) {
			setResolvedPath(null);
			setActiveTab(0);
			shellInitialized.current = false;
		}
	}, [open]);

	// Compute branch name once (stable across renders)
	const branchRef = useRef<string | null>(null);
	if (open && !branchRef.current) {
		if (issueContext) {
			branchRef.current = buildBranchName(issueContext);
		} else {
			const now = new Date();
			const ts = [
				now.getFullYear(),
				String(now.getMonth() + 1).padStart(2, '0'),
				String(now.getDate()).padStart(2, '0'),
				'-',
				String(now.getHours()).padStart(2, '0'),
				String(now.getMinutes()).padStart(2, '0'),
				String(now.getSeconds()).padStart(2, '0'),
			].join('');
			branchRef.current = `tmp/${ts}`;
		}
	}
	if (!open) {
		branchRef.current = null;
	}
	const branch = branchRef.current;

	// Ensure DB session exists — only for NEW sessions (not viewing existing ones from sidebar)
	const isNewSession = !existingSessionId;
	useEffect(() => {
		if (!open || !projectPath || !sessionId || !isNewSession) return;
		const projectName = projectPath.split('/').filter(Boolean).pop() ?? 'unknown';
		ensureSession({
			sessionId,
			projectPath,
			projectName,
			agentName: agentFile?.name ?? (issueContext ? `#${issueContext.issueNumber}` : null),
			branch,
			issueOwner: issueContext?.owner ?? null,
			issueRepo: issueContext?.repo ?? null,
			issueNumber: issueContext?.issueNumber ?? null,
			issueTitle: issueContext?.issueTitle ?? null,
		});
	}, [
		open,
		sessionId,
		projectPath,
		agentFile,
		issueContext,
		ensureSession,
		isNewSession,
		branch,
	]);

	// Build draggable terminal tabs
	const hasIssue = !!(issueContext || session?.issue_number);
	const termTabs = useMemo(() => {
		const items: TabItem[] = [];
		// Hide Claude tab for past (closed) sessions — no terminal to show
		if (!isPastSession) {
			items.push({
				key: 'claude',
				label: (
					<>
						<SmartToyRoundedIcon sx={{ fontSize: 16 }} /> Claude
					</>
				),
			});
		}
		items.push({
			key: 'activity',
			label: (
				<>
					<TimelineRoundedIcon sx={{ fontSize: 16 }} /> Activity
				</>
			),
		});
		items.push({
			key: 'diff',
			label: (
				<>
					<DifferenceRoundedIcon sx={{ fontSize: 16 }} /> Fichiers
				</>
			),
		});
		if (!isPastSession) {
			items.push({
				key: 'terminal',
				label: (
					<>
						<TerminalRoundedIcon sx={{ fontSize: 16 }} /> Terminal
					</>
				),
			});
		}
		if (hasIssue) {
			items.push({
				key: 'issue',
				label: (
					<>
						<BugReportRoundedIcon sx={{ fontSize: 16 }} /> Issue
					</>
				),
			});
		}
		return items;
	}, [hasIssue, isPastSession]);

	const orderedTermTabs = useMemo(() => {
		if (!termTabOrder) return termTabs;
		const map = new Map(termTabs.map((t) => [t.key, t]));
		const ordered = termTabOrder.map((k) => map.get(k)).filter(Boolean) as TabItem[];
		for (const t of termTabs) {
			if (!termTabOrder.includes(t.key)) ordered.push(t);
		}
		return ordered;
	}, [termTabs, termTabOrder]);

	const activeTabKey = orderedTermTabs[activeTab]?.key ?? 'claude';

	// Refit + refocus terminal when switching tabs
	useEffect(() => {
		if (activeTabKey === 'claude') {
			requestAnimationFrame(() => {
				fitAddonRef.current?.fit();
				terminalRef.current?.focus();
			});
		} else if (activeTabKey === 'terminal') {
			requestAnimationFrame(() => {
				shellFitAddonRef.current?.fit();
				shellTerminalRef.current?.focus();
			});
		}
	}, [activeTabKey]);

	// Don't connect terminal for past sessions
	const terminalEnabled = !isPastSession;

	useEffect(() => {
		if (!open || !projectPath || !termNode || !terminalEnabled) return;

		setResumed(false);

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
			scrollback: 5000,
			theme: {
				background: '#1A1A1A',
				foreground: '#E0E0E0',
				cursor: '#7C4DFF',
				selectionBackground: 'rgba(124, 77, 255, 0.3)',
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
		terminal.open(termNode);

		// GPU-accelerated rendering
		try {
			terminal.loadAddon(new WebglAddon());
		} catch {
			/* fallback to canvas */
		}

		requestAnimationFrame(() => {
			fitAddon.fit();
			terminal.focus();
		});

		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;

		const ws = new WebSocket('ws://localhost:4001');
		wsRef.current = ws;

		const isReopen = false;

		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					type: 'init',
					sessionId,
					cwd: projectPath,
					cols: terminal.cols,
					rows: terminal.rows,
				}),
			);
		};

		ws.onmessage = (event) => {
			if (typeof event.data === 'string') {
				try {
					const msg = JSON.parse(event.data);
					if (msg.type === 'init-ack') {
						setResumed(msg.resumed);
						if (!msg.resumed && !isReopen) {
							// Create branch then launch Claude with --worktree
							const reporting = buildReportingPrompt(sessionId);
							const basePrompt = agentFile ? agentFile.content : '';
							const fullPrompt = basePrompt + reporting;
							const escaped = fullPrompt.replace(/'/g, "'\\''");
							const branchCmd = branch
								? `git checkout -b ${branch} 2>/dev/null; `
								: '';
							const claudeCmd = `unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT && ${branchCmd}/opt/homebrew/bin/claude --worktree --system-prompt '${escaped}'\n`;

							setTimeout(() => {
								ws.send(JSON.stringify({ type: 'input', data: claudeCmd }));
							}, 800);
						}
						// Wait for initial buffer to flush before tracking streaming
						setTimeout(() => {
							readyRef.current = true;
						}, 2000);
						return;
					}
				} catch {
					// Not JSON — terminal output
				}
				terminal.write(event.data);

				// Track streaming via ref to avoid re-renders on every chunk
				if (readyRef.current) {
					if (!isStreamingRef.current) {
						isStreamingRef.current = true;
						setIsStreaming(true);
					}
					if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
					streamTimeoutRef.current = setTimeout(() => {
						isStreamingRef.current = false;
						setIsStreaming(false);
					}, 3000);
				}
			}
		};

		ws.onclose = () => {
			terminal.write('\r\n\x1b[90m[Session disconnected]\x1b[0m\r\n');
		};

		terminal.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'input', data }));
			}
		});

		// Intercept wheel events and forward as SGR mouse sequences to tmux
		// tmux uses alternate screen buffer which disables xterm.js scrollback,
		// so we manually send wheel escape sequences that tmux (with mouse on) interprets as scroll
		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (ws.readyState !== WebSocket.OPEN) return;
			const lines = Math.max(1, Math.round(Math.abs(e.deltaY) / 40));
			// SGR mouse: button 64 = wheel up, 65 = wheel down
			const button = e.deltaY < 0 ? 64 : 65;
			const seq = `\x1b[<${button};1;1M`;
			for (let i = 0; i < lines; i++) {
				ws.send(JSON.stringify({ type: 'input', data: seq }));
			}
		};
		termNode.addEventListener('wheel', handleWheel, { passive: false });

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
			termNode.removeEventListener('wheel', handleWheel);
			if (resizeTimer) clearTimeout(resizeTimer);
			observer.disconnect();
			ws.close();
			terminal.dispose();
			terminalRef.current = null;
			wsRef.current = null;
			fitAddonRef.current = null;
			if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
			isStreamingRef.current = false;
			setIsStreaming(false);
			readyRef.current = false;
		};
	}, [open, projectPath, agentFile, termNode, sessionId, terminalEnabled, isPastSession]);

	// Plain shell terminal (tab 2) — lazy init when tab is first selected
	useEffect(() => {
		if (!open || !projectPath || !shellTermNode || activeTab !== 2) return;
		if (shellInitialized.current) return;
		shellInitialized.current = true;

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
		terminal.open(shellTermNode);

		try {
			terminal.loadAddon(new WebglAddon());
		} catch {
			/* fallback to canvas */
		}

		requestAnimationFrame(() => {
			fitAddon.fit();
			terminal.focus();
		});

		shellTerminalRef.current = terminal;
		shellFitAddonRef.current = fitAddon;

		const shellSessionId = `${sessionId}-shell`;
		const ws = new WebSocket('ws://localhost:4001');
		shellWsRef.current = ws;

		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					type: 'init',
					sessionId: shellSessionId,
					cwd: projectPath,
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
					// Not JSON — terminal output
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

		// Wheel → SGR mouse sequences for tmux scroll (same as Claude terminal)
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
		shellTermNode.addEventListener('wheel', handleWheel, { passive: false });

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
		observer.observe(shellTermNode);

		return () => {
			shellTermNode.removeEventListener('wheel', handleWheel);
			if (resizeTimer) clearTimeout(resizeTimer);
			observer.disconnect();
			ws.close();
			terminal.dispose();
			shellTerminalRef.current = null;
			shellWsRef.current = null;
			shellFitAddonRef.current = null;
			shellInitialized.current = false;
		};
	}, [open, projectPath, shellTermNode, sessionId, activeTab]);

	// Display info
	const folderLabel = issueContext
		? `${issueContext.owner}/${issueContext.repo}`
		: (projectPath?.split('/').filter(Boolean).pop() ?? '');

	const titleIcon = agentFile ? (
		<DescriptionRoundedIcon sx={{ color: '#7C5CFF' }} />
	) : issueContext ? (
		<SmartToyRoundedIcon sx={{ color: '#7C5CFF' }} />
	) : (
		<TerminalRoundedIcon sx={{ color: '#00E5FF' }} />
	);

	const titleText = agentFile
		? agentFile.name
		: issueContext
			? `Agent — #${issueContext.issueNumber}`
			: existingSessionId
				? 'Session active'
				: 'Nouvelle session';

	const subtitleText = issueContext?.issueTitle;

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth={false}
			fullWidth
			disableAutoFocus
			disableEnforceFocus
			disableRestoreFocus
			PaperProps={{
				sx: {
					bgcolor: 'background.paper',
					maxWidth: 1400,
					height: '90vh',
					borderRadius: 1,
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
				},
			}}
		>
			<DialogTitle
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					pb: 1,
					flexShrink: 0,
				}}
			>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
					{titleIcon}
					<Typography variant="subtitle1" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
						{titleText}
					</Typography>
					{subtitleText && (
						<Typography
							variant="body2"
							sx={{
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								maxWidth: 350,
								color: 'text.secondary',
							}}
						>
							{subtitleText}
						</Typography>
					)}
					{resumed && (
						<Chip
							icon={
								<FiberManualRecordRoundedIcon
									sx={{
										fontSize: '10px !important',
										color: '#4CAF50 !important',
									}}
								/>
							}
							label="Reprise"
							size="small"
							sx={{
								height: 22,
								fontSize: '0.65rem',
								bgcolor: 'rgba(76, 175, 80, 0.12)',
								color: '#4CAF50',
								fontWeight: 600,
							}}
						/>
					)}
				</Box>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
					<Chip
						icon={<FolderOpenRoundedIcon sx={{ fontSize: '14px !important' }} />}
						label={folderLabel}
						size="small"
						sx={{
							height: 24,
							fontSize: '0.7rem',
							bgcolor: 'rgba(255,255,255,0.05)',
							'& .MuiChip-icon': { color: 'text.secondary' },
						}}
					/>
					<IconButton
						size="small"
						onClick={handlePip}
						sx={{ color: 'text.disabled', '&:hover': { color: '#7C5CFF' } }}
					>
						<PictureInPictureAltRoundedIcon sx={{ fontSize: 18 }} />
					</IconButton>
					<IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
						<CloseRoundedIcon fontSize="small" />
					</IconButton>
				</Box>
			</DialogTitle>

			{/* Tabs */}
			<DraggableTabs
				tabs={orderedTermTabs}
				activeTab={activeTab}
				onTabChange={setActiveTab}
				onReorder={setTermTabOrder}
				mb={0}
				sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
			/>

			{/* Terminal panel */}
			<Box
				onWheel={(e) => e.stopPropagation()}
				sx={{
					flex: 1,
					overflow: 'hidden',
					display: activeTabKey === 'claude' ? 'flex' : 'none',
					alignItems: 'stretch',
					bgcolor: '#1A1A1A', // Terminal always dark
					'& .xterm': { height: '100%', p: 1 },
					'& .xterm-viewport': {
						overflowY: 'scroll !important',
						'&::-webkit-scrollbar': { width: 6 },
						'&::-webkit-scrollbar-thumb': { bgcolor: '#3A3A3A', borderRadius: 3 },
					},
				}}
			>
				{/* Picking directory state */}
				{picking && (
					<Box
						sx={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 2,
						}}
					>
						<CircularProgress size={28} sx={{ color: '#7C5CFF' }} />
						<Typography variant="body2" color="text.secondary">
							Sélection du répertoire...
						</Typography>
					</Box>
				)}

				{/* Loading state */}
				{!projectPath && !picking && issueContext && (
					<Box
						sx={{
							flex: 1,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<CircularProgress size={24} sx={{ color: '#7C5CFF' }} />
					</Box>
				)}

				{/* Past session — terminal disabled */}
				{isPastSession && projectPath && (
					<Box
						sx={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 2,
						}}
					>
						<TerminalRoundedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
						<Typography variant="body2" sx={{ color: 'text.secondary' }}>
							Session terminée
						</Typography>
					</Box>
				)}

				<Box
					ref={setTermNode}
					sx={{ flex: 1, display: projectPath && terminalEnabled ? 'flex' : 'none' }}
				/>
			</Box>

			{/* Activity panel */}
			{activeTabKey === 'activity' && (
				<Box sx={{ flex: 1, overflow: 'hidden' }}>
					<AgentActivityTab session={session} logs={logs} isStreaming={isStreaming} />
				</Box>
			)}

			{/* Diff panel */}
			{activeTabKey === 'diff' && (
				<Box sx={{ flex: 1, overflow: 'hidden' }}>
					<AgentDiffTab
						projectPath={projectPath ?? null}
						branch={session?.branch ?? branch}
					/>
				</Box>
			)}

			{/* Plain shell terminal panel */}
			<Box
				onWheel={(e) => e.stopPropagation()}
				sx={{
					flex: 1,
					overflow: 'hidden',
					display: activeTabKey === 'terminal' ? 'flex' : 'none',
					alignItems: 'stretch',
					bgcolor: '#1A1A1A', // Terminal always dark
					'& .xterm': { height: '100%', p: 1 },
					'& .xterm-viewport': {
						overflowY: 'scroll !important',
						'&::-webkit-scrollbar': { width: 6 },
						'&::-webkit-scrollbar-thumb': { bgcolor: '#3A3A3A', borderRadius: 3 },
					},
				}}
			>
				<Box ref={setShellTermNode} sx={{ flex: 1, display: 'flex' }} />
			</Box>

			{/* Issue panel */}
			{activeTabKey === 'issue' && (issueContext || session?.issue_number) && (
				<Box sx={{ flex: 1, overflow: 'hidden' }}>
					<AgentIssueTab
						owner={issueContext?.owner ?? session!.issue_owner!}
						repo={issueContext?.repo ?? session!.issue_repo!}
						issueNumber={issueContext?.issueNumber ?? session!.issue_number!}
					/>
				</Box>
			)}
		</Dialog>
	);
}
