'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
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
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
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

	return `${prefix}/${issueContext.issueNumber}-${slug}`;
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
	const endpoint = `http://localhost:4000/api/agent-sessions/log`;
	const curlBase = [
		`curl -s -X POST ${endpoint} \\`,
		`  -H "Content-Type: application/json" \\`,
		`  -d '<JSON>'`,
	].join('\n');

	return [
		'',
		'## Activity Reporting',
		'',
		"Tu DOIS reporter ton activité en continu via l'API ci-dessous. Chaque log est une synthèse concise (1-2 phrases) de ce que tu viens de faire.",
		'',
		`Endpoint : POST ${endpoint}`,
		`Payload JSON : { "sessionId": "${sessionId}", "content": "<MESSAGE>", "logType": "<TYPE>" }`,
		'',
		'### Types de logs et quand les utiliser :',
		"- **info** : décisions prises, début d'analyse, changement d'approche",
		'- **file_change** : fichiers créés/modifiés/supprimés (lister les fichiers)',
		'- **commit** : quand tu fais un commit (inclure le message de commit)',
		'- **error** : erreurs rencontrées, blocages',
		'- **summary** : uniquement à la FIN de ta tâche, résumé global (3-5 bullet points)',
		'',
		'### Règles :',
		'1. Envoie un log **après chaque action significative** (pas avant, après)',
		'2. Pour le summary final, ajoute `"branch": "<BRANCHE>"` et `"status": "completed"` (ou `"error"`)',
		'3. Sois concis : pas de blabla, juste les faits',
		'',
		'### Exemple :',
		'```bash',
		curlBase.replace(
			'<JSON>',
			`'{"sessionId": "${sessionId}", "content": "Modifié src/components/Header.tsx : ajout du bouton de navigation", "logType": "file_change"}'`,
		),
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
	const [isStreaming, setIsStreaming] = useState(false);
	const isStreamingRef = useRef(false);
	const [reopened, setReopened] = useState(false);
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

	const { session, logs, ensureSession, reopenSession } = useAgentSession(
		open ? sessionId : undefined,
	);
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
			setReopened(false);
			shellInitialized.current = false;
		}
	}, [open]);

	// Ensure DB session exists — only for NEW sessions (not viewing existing ones from sidebar)
	const isNewSession = !existingSessionId || (isPastSession && reopened);
	useEffect(() => {
		if (!open || !projectPath || !sessionId || !isNewSession) return;
		const projectName = projectPath.split('/').filter(Boolean).pop() ?? 'unknown';
		ensureSession({
			sessionId,
			projectPath,
			projectName,
			agentName: agentFile?.name ?? (issueContext ? `#${issueContext.issueNumber}` : null),
			branch: issueContext ? buildBranchName(issueContext) : null,
			issueOwner: issueContext?.owner ?? null,
			issueRepo: issueContext?.repo ?? null,
			issueNumber: issueContext?.issueNumber ?? null,
			issueTitle: issueContext?.issueTitle ?? null,
		});
	}, [open, sessionId, projectPath, agentFile, issueContext, ensureSession, isNewSession]);

	// Refit + refocus terminal when switching tabs
	useEffect(() => {
		if (activeTab === 0) {
			requestAnimationFrame(() => {
				fitAddonRef.current?.fit();
				terminalRef.current?.focus();
			});
		} else if (activeTab === 2) {
			requestAnimationFrame(() => {
				shellFitAddonRef.current?.fit();
				shellTerminalRef.current?.focus();
			});
		}
	}, [activeTab]);

	// Don't connect terminal for past sessions until reopened
	const terminalEnabled = !isPastSession || reopened;

	useEffect(() => {
		if (!open || !projectPath || !termNode || !terminalEnabled) return;

		setResumed(false);

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
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

		const isReopen = isPastSession && reopened;

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
							const reporting = buildReportingPrompt(sessionId);
							const basePrompt = agentFile ? agentFile.content : '';
							const fullPrompt = basePrompt + reporting;
							const escaped = fullPrompt.replace(/'/g, "'\\''");
							const claudeCmd = `claude --system-prompt '${escaped}'\n`;

							if (issueContext) {
								// Create branch + checkout, then start Claude
								const branch = buildBranchName(issueContext);
								const gitCmd = `git checkout -b ${branch} 2>/dev/null || git checkout ${branch}\n`;
								setTimeout(() => {
									ws.send(JSON.stringify({ type: 'input', data: gitCmd }));
									// Wait for git to finish, then launch Claude
									setTimeout(() => {
										ws.send(JSON.stringify({ type: 'input', data: claudeCmd }));
									}, 1500);
								}, 800);
							} else {
								setTimeout(() => {
									ws.send(JSON.stringify({ type: 'input', data: claudeCmd }));
								}, 800);
							}
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
			if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
			isStreamingRef.current = false;
			setIsStreaming(false);
			readyRef.current = false;
		};
	}, [
		open,
		projectPath,
		agentFile,
		termNode,
		sessionId,
		terminalEnabled,
		isPastSession,
		reopened,
	]);

	// Plain shell terminal (tab 2) — lazy init when tab is first selected
	useEffect(() => {
		if (!open || !projectPath || !shellTermNode || activeTab !== 2) return;
		if (shellInitialized.current) return;
		shellInitialized.current = true;

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
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
				? 'Active Session'
				: 'New Session';

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
					bgcolor: '#1E1E1E',
					maxWidth: 1000,
					height: '80vh',
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
					pb: 5,
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
							label="Resumed"
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
			<Tabs
				value={activeTab}
				onChange={(_, v) => setActiveTab(v)}
				sx={{
					minHeight: 36,
					px: 2,
					borderBottom: 1,
					borderColor: 'divider',
					flexShrink: 0,
					'& .MuiTab-root': {
						minHeight: 36,
						minWidth: 0,
						px: 2,
						py: 0.5,
						fontSize: '0.8rem',
						fontWeight: 600,
						textTransform: 'none',
						color: 'text.secondary',
						gap: 0.75,
						'&.Mui-selected': { color: '#7C5CFF' },
					},
					'& .MuiTabs-indicator': { bgcolor: '#7C5CFF', height: 2 },
				}}
			>
				<Tab
					icon={<SmartToyRoundedIcon sx={{ fontSize: 16 }} />}
					iconPosition="start"
					label="Claude"
				/>
				<Tab
					icon={<TimelineRoundedIcon sx={{ fontSize: 16 }} />}
					iconPosition="start"
					label="Activity"
				/>
				<Tab
					icon={<TerminalRoundedIcon sx={{ fontSize: 16 }} />}
					iconPosition="start"
					label="Terminal"
				/>
				{(issueContext || session?.issue_number) && (
					<Tab
						icon={<BugReportRoundedIcon sx={{ fontSize: 16 }} />}
						iconPosition="start"
						label="Issue"
					/>
				)}
			</Tabs>

			{/* Terminal panel */}
			<Box
				sx={{
					flex: 1,
					overflow: 'hidden',
					display: activeTab === 0 ? 'flex' : 'none',
					alignItems: 'stretch',
					bgcolor: '#1A1A1A',
					'& .xterm': { height: '100%', p: 1 },
					'& .xterm-viewport': {
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
							Select repository directory...
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

				{/* Reopen state for past sessions */}
				{isPastSession && !reopened && projectPath && (
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
						<Button
							variant="contained"
							startIcon={<ReplayRoundedIcon />}
							onClick={() => {
								setReopened(true);
								reopenSession();
							}}
							sx={{
								bgcolor: '#7C5CFF',
								textTransform: 'none',
								fontWeight: 600,
								'&:hover': { bgcolor: alpha('#7C5CFF', 0.85) },
							}}
						>
							Reopen session
						</Button>
					</Box>
				)}

				<Box
					ref={setTermNode}
					sx={{ flex: 1, display: projectPath && terminalEnabled ? 'flex' : 'none' }}
				/>
			</Box>

			{/* Activity panel */}
			{activeTab === 1 && (
				<Box sx={{ flex: 1, overflow: 'hidden' }}>
					<AgentActivityTab session={session} logs={logs} isStreaming={isStreaming} />
				</Box>
			)}

			{/* Plain shell terminal panel */}
			<Box
				sx={{
					flex: 1,
					overflow: 'hidden',
					display: activeTab === 2 ? 'flex' : 'none',
					alignItems: 'stretch',
					bgcolor: '#1A1A1A',
					'& .xterm': { height: '100%', p: 1 },
					'& .xterm-viewport': {
						'&::-webkit-scrollbar': { width: 6 },
						'&::-webkit-scrollbar-thumb': { bgcolor: '#3A3A3A', borderRadius: 3 },
					},
				}}
			>
				<Box ref={setShellTermNode} sx={{ flex: 1, display: 'flex' }} />
			</Box>

			{/* Issue panel */}
			{activeTab === 3 && (issueContext || session?.issue_number) && (
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
