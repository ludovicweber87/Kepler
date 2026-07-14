'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { alpha } from '@mui/material/styles';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import PictureInPictureAltRoundedIcon from '@mui/icons-material/PictureInPictureAltRounded';
import { useTranslations } from 'next-intl';
import { useAgentSessionHistory, useAgentSession } from '@/hooks/useAgentSession';
import { useSessionActions } from '@/hooks/useSessionActions';
import { useOverlayTerminal } from '@/hooks/useOverlayTerminal';
import { useSnackbar } from '@/hooks/useSnackbar';
import { apiFetch } from '@/lib/api-fetch';
import { classifySession } from '@/lib/sessionStatus';
import { resolveEffectivePath } from '@/lib/effectivePath';
import { resolveRepoFullName } from '@/lib/resolveRepoFullName';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useRepoSettings } from '@/hooks/useRepoSettings';
import { useGitDiff } from '@/hooks/useGitDiff';
import AgentChatTab from '@/components/agents/AgentChatTab';
import { FileDiffView } from '@/components/agents/AgentDiffTab';
import ChangedFilesList from '@/components/agents/ChangedFilesList';
import AgentActivityTab from '@/components/agents/AgentActivityTab';
import AgentIssueTab from '@/components/agents/AgentIssueTab';
import ShellTerminal, { type ShellTerminalHandle } from '@/components/agents/ShellTerminal';
import CreationProgress from '@/components/workbench/CreationProgress';
import { matchFileDiff, resolveTabAfterClose, addOpenFile, CHAT_TAB } from '@/lib/workbenchTabs';

export default function Workbench() {
	const t = useTranslations('workbench');
	const tc = useTranslations('common');
	const td = useTranslations('agentDiff');
	const searchParams = useSearchParams();
	const router = useRouter();
	const sessionId = searchParams.get('session') ?? undefined;

	const { data: allSessions = [] } = useAgentSessionHistory();
	const { session, logs } = useAgentSession(sessionId);
	const { stop, resume } = useSessionActions();
	const queryClient = useQueryClient();
	const overlay = useOverlayTerminal();
	const { showSnackbar } = useSnackbar();

	const [confirmClose, setConfirmClose] = useState(false);
	const [closing, setClosing] = useState(false);
	const firstPromptSent = useRef(false);
	const shellRef = useRef<ShellTerminalHandle>(null);

	// Fallback : la session peut deja etre dans l'historique avant que useAgentSession resolve.
	const resolved = useMemo(
		() => session ?? allSessions.find((s) => s.session_id === sessionId) ?? null,
		[session, allSessions, sessionId],
	);

	const { repoPaths } = useRepoPaths();
	const repoFullName = useMemo(
		() => resolveRepoFullName(resolved, repoPaths),
		[resolved, repoPaths],
	);
	const { settings: repoSettings, isLoading: repoSettingsLoading } =
		useRepoSettings(repoFullName);

	const bucket = resolved ? classifySession(resolved) : null;
	const isArchived = bucket === 'archived';
	const chatReadOnly = !!sessionId && bucket !== null && bucket !== 'active';

	const hasIssue = !!(resolved?.issue_owner && resolved?.issue_repo && resolved?.issue_number);

	type RightTab = 'changes' | 'activity' | 'issue';
	const [rightTab, setRightTab] = useState<RightTab>('activity');

	useEffect(() => {
		if (rightTab === 'issue' && !hasIssue) setRightTab('activity');
	}, [rightTab, hasIssue]);

	// Onglets gauche : 'chat' + un chemin de fichier par onglet ouvert.
	const [openFiles, setOpenFiles] = useState<string[]>([]);
	const [activeTab, setActiveTab] = useState<string>(CHAT_TAB);
	const [focusNonce, setFocusNonce] = useState(0);

	useEffect(() => {
		setOpenFiles([]);
		setActiveTab(CHAT_TAB);
		setRightTab('activity');
		setFocusNonce(0);
	}, [sessionId]);

	const diffPath = resolved?.worktree_path ?? resolved?.project_path ?? null;
	const { files: changedFiles } = useGitDiff(diffPath, resolved?.branch ?? null);

	const openChanges = useCallback((filePath: string) => {
		if (!filePath) return;
		setOpenFiles((prev) => addOpenFile(prev, filePath));
		setActiveTab(filePath);
		setFocusNonce((n) => n + 1);
	}, []);

	const closeFile = useCallback(
		(filePath: string) => {
			setActiveTab((active) => resolveTabAfterClose(openFiles, filePath, active));
			setOpenFiles((prev) => prev.filter((p) => p !== filePath));
		},
		[openFiles],
	);

	const activeFileDiff =
		activeTab === CHAT_TAB ? undefined : matchFileDiff(changedFiles, activeTab);

	// Resize vertical de la zone terminal (px depuis le bas).
	const [termHeight, setTermHeight] = useState(240);
	const resizing = useRef(false);
	const startResize = useCallback((e: React.MouseEvent) => {
		resizing.current = true;
		e.preventDefault();
		const onMove = (ev: MouseEvent) => {
			if (!resizing.current) return;
			const fromBottom = window.innerHeight - ev.clientY;
			setTermHeight(Math.max(120, Math.min(window.innerHeight - 200, fromBottom)));
		};
		const onUp = () => {
			resizing.current = false;
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			document.body.style.userSelect = '';
		};
		document.body.style.userSelect = 'none';
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, []);

	const effectivePath = useMemo(
		() =>
			resolveEffectivePath({
				session: resolved,
				projectPath: resolved?.project_path ?? null,
				worktreePath: resolved?.worktree_path ?? null,
			}),
		[resolved],
	);

	const branch = resolved?.branch ?? null;
	const repoLabel =
		resolved?.project_name ?? resolved?.project_path?.split('/').filter(Boolean).pop() ?? '';
	const isAutoNamed = !!branch && branch.startsWith('wip-');

	const submitRenameFromPrompt = useCallback(
		(promptText: string) => {
			apiFetch('/api/agent-sessions/rename-from-prompt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId, prompt: promptText }),
			})
				.then((res) => (res.ok ? res.json() : null))
				.then((data) => {
					if (data?.branch) {
						if (resolved?.project_path)
							queryClient.invalidateQueries({
								queryKey: ['git-worktrees', resolved.project_path],
							});
						queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
						queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
					}
				})
				.catch(() => {});
		},
		[sessionId, resolved?.project_path, queryClient],
	);

	const handlePip = useCallback(() => {
		if (!sessionId || !effectivePath) return;
		const projectName = effectivePath.split('/').filter(Boolean).pop() ?? 'unknown';
		overlay.open({
			sessionId,
			projectPath: effectivePath,
			projectName,
			isPastSession: chatReadOnly,
		});
	}, [sessionId, effectivePath, chatReadOnly, overlay]);

	const handleStop = useCallback(async () => {
		if (!sessionId) return;
		setClosing(true);
		try {
			await stop(sessionId);
			showSnackbar(tc('sessionKilled'), 'success');
			setConfirmClose(false);
			router.push('/workbench');
		} catch {
			showSnackbar(tc('error'), 'error');
		} finally {
			setClosing(false);
		}
	}, [sessionId, stop, showSnackbar, tc, router]);

	if (!sessionId) {
		return (
			<Box
				sx={{
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 2,
					px: 4,
					textAlign: 'center',
				}}
			>
				<TerminalRoundedIcon sx={{ fontSize: 56, color: 'primary.main', opacity: 0.5 }} />
				<Typography variant="h6" sx={{ fontWeight: 600 }}>
					{t('emptyTitle')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>
					{t('emptyDesc')}
				</Typography>
			</Box>
		);
	}

	if (
		resolved &&
		(resolved.status === 'provisioning' ||
			(resolved.status === 'error' && !resolved.worktree_path))
	) {
		if (repoSettingsLoading) {
			return (
				<Box
					sx={{
						height: '100%',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<CircularProgress />
				</Box>
			);
		}
		return <CreationProgress session={resolved} repoSettings={repoSettings} />;
	}

	return (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
			{/* Header session */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					px: 2,
					py: 1,
					borderBottom: 1,
					borderColor: 'divider',
					flexShrink: 0,
				}}
			>
				<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
					{resolved?.agent_name ??
						(bucket === 'active' ? t('activeSession') : t('newSession'))}
				</Typography>
				{branch && (
					<Chip
						icon={<AccountTreeRoundedIcon sx={{ fontSize: '14px !important' }} />}
						label={branch}
						size="small"
						sx={{
							height: 22,
							fontSize: '0.65rem',
							bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
							color: 'primary.main',
							fontWeight: 600,
							'& .MuiChip-icon': { color: 'primary.main' },
						}}
					/>
				)}
				<Box sx={{ flex: 1 }} />
				<Chip
					icon={<FolderOpenRoundedIcon sx={{ fontSize: '14px !important' }} />}
					label={repoLabel}
					size="small"
					sx={{
						height: 24,
						fontSize: '0.7rem',
						bgcolor: (theme) => alpha(theme.palette.text.primary, 0.05),
					}}
				/>
				{bucket === 'active' && (
					<Tooltip title={t('stopSession')} arrow>
						<IconButton
							size="small"
							onClick={() => setConfirmClose(true)}
							sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
						>
							<StopCircleRoundedIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</Tooltip>
				)}
				<IconButton
					size="small"
					onClick={handlePip}
					sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
				>
					<PictureInPictureAltRoundedIcon sx={{ fontSize: 18 }} />
				</IconButton>
			</Box>

			{/* Split gauche/droite */}
			<Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
				{/* Gauche : conversation + changes 75% */}
				<Box
					sx={{ flex: '0 0 75%', minWidth: 0, display: 'flex', flexDirection: 'column' }}
				>
					{/* Onglets : Chat + un onglet par fichier ouvert */}
					<Tabs
						value={activeTab}
						onChange={(_, val) => setActiveTab(val as string)}
						variant="scrollable"
						scrollButtons="auto"
						sx={{
							minHeight: 40,
							borderBottom: 1,
							borderColor: 'divider',
							flexShrink: 0,
							'& .MuiTab-root': { textTransform: 'none', minHeight: 40 },
						}}
					>
						<Tab value={CHAT_TAB} label={t('tabChat')} />
						{openFiles.map((path) => {
							const name = path.split('/').filter(Boolean).pop() ?? path;
							return (
								<Tab
									key={path}
									value={path}
									label={
										<Box
											component="span"
											sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
										>
											<Tooltip title={path} arrow>
												<Box component="span">{name}</Box>
											</Tooltip>
											<Box
												component="span"
												role="button"
												tabIndex={0}
												aria-label={t('closeFile')}
												onClick={(e) => {
													e.stopPropagation();
													closeFile(path);
												}}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.stopPropagation();
														e.preventDefault();
														closeFile(path);
													}
												}}
												sx={{
													display: 'inline-flex',
													borderRadius: '50%',
													'&:hover': { color: 'error.main' },
												}}
											>
												<CloseRoundedIcon sx={{ fontSize: 14 }} />
											</Box>
										</Box>
									}
								/>
							);
						})}
					</Tabs>

					{/* Contenu : on garde le chat monté (WebSocket) et on masque via display. */}
					<Box
						sx={{
							flex: 1,
							minHeight: 0,
							display: activeTab === CHAT_TAB ? 'flex' : 'none',
							flexDirection: 'column',
						}}
					>
						<AgentChatTab
							sessionId={sessionId}
							cwd={effectivePath}
							systemPrompt={resolved?.system_prompt ?? undefined}
							readOnly={chatReadOnly}
							archived={isArchived}
							createPrPrompt={repoSettings.create_pr_prompt}
							onResume={() => {
								resume(sessionId).catch(() => {});
							}}
							onOpenChanges={openChanges}
							onFirstUserMessage={(text) => {
								if (isAutoNamed && !firstPromptSent.current) {
									firstPromptSent.current = true;
									submitRenameFromPrompt(text);
								}
							}}
						/>
					</Box>
					{activeTab !== CHAT_TAB && (
						<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
							{activeFileDiff ? (
								<FileDiffView
									key={activeTab}
									file={activeFileDiff}
									focused
									focusNonce={focusNonce}
								/>
							) : (
								<Box
									sx={{
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										height: '100%',
										px: 2,
									}}
								>
									<Typography variant="caption" sx={{ color: 'text.disabled' }}>
										{td('noChanges')}
									</Typography>
								</Box>
							)}
						</Box>
					)}
				</Box>
				{/* Droite : sidebar (Task 4) */}
				<Box
					sx={{
						flex: 1,
						minWidth: 0,
						borderLeft: 1,
						borderColor: 'divider',
						display: 'flex',
						flexDirection: 'column',
						minHeight: 0,
					}}
				>
					{/* Onglets droite : Changes | Activity | Issue */}
					<Tabs
						value={rightTab}
						onChange={(_, val) => setRightTab(val as RightTab)}
						variant="scrollable"
						scrollButtons="auto"
						sx={{
							minHeight: 40,
							borderBottom: 1,
							borderColor: 'divider',
							flexShrink: 0,
							'& .MuiTab-root': { textTransform: 'none', minHeight: 40 },
						}}
					>
						<Tab
							value="changes"
							iconPosition="start"
							icon={<DescriptionRoundedIcon sx={{ fontSize: 16 }} />}
							label={
								changedFiles.length > 0
									? `${t('tabChanges')} (${changedFiles.length})`
									: t('tabChanges')
							}
						/>
						<Tab
							value="activity"
							iconPosition="start"
							icon={<TimelineRoundedIcon sx={{ fontSize: 16 }} />}
							label={t('chipActivity')}
						/>
						{hasIssue && (
							<Tab
								value="issue"
								iconPosition="start"
								icon={<BugReportRoundedIcon sx={{ fontSize: 16 }} />}
								label={t('chipIssue')}
							/>
						)}
					</Tabs>

					{/* Panneau droit */}
					<Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
						{rightTab === 'changes' && (
							<ChangedFilesList
								changedFiles={changedFiles}
								onOpenFile={openChanges}
							/>
						)}
						{rightTab === 'activity' && (
							<AgentActivityTab session={resolved} logs={logs} />
						)}
						{rightTab === 'issue' && hasIssue && (
							<AgentIssueTab
								owner={resolved!.issue_owner!}
								repo={resolved!.issue_repo!}
								issueNumber={resolved!.issue_number!}
							/>
						)}
					</Box>

					{/* Handle de resize */}
					<Box
						onMouseDown={startResize}
						sx={{
							height: 6,
							flexShrink: 0,
							cursor: 'row-resize',
							bgcolor: 'divider',
							'&:hover': { bgcolor: 'primary.main' },
						}}
					/>

					{/* Terminal empilé */}
					<Box
						sx={{
							height: termHeight,
							flexShrink: 0,
							display: 'flex',
							flexDirection: 'column',
							minHeight: 0,
						}}
					>
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								px: 1.5,
								py: 0.5,
								borderBottom: 1,
								borderColor: 'divider',
								flexShrink: 0,
							}}
						>
							<Typography
								variant="caption"
								sx={{ fontWeight: 600, color: 'text.secondary' }}
							>
								{t('terminal')}
							</Typography>
							{repoSettings.run_scripts.length > 0 && (
								<Box
									sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', ml: 'auto' }}
								>
									{repoSettings.run_scripts
										.filter((rs) => rs.command.trim())
										.map((rs) => (
											<Chip
												key={rs.id}
												label={rs.name || rs.command}
												size="small"
												onClick={() =>
													shellRef.current?.runCommand(rs.command)
												}
												sx={{ cursor: 'pointer' }}
											/>
										))}
								</Box>
							)}
						</Box>
						<ShellTerminal
							ref={shellRef}
							sessionId={sessionId}
							cwd={effectivePath}
							active
							ready={!!resolved}
						/>
					</Box>
				</Box>
			</Box>

			{/* Confirm stop */}
			<Dialog
				open={confirmClose}
				onClose={() => !closing && setConfirmClose(false)}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle sx={{ fontWeight: 600 }}>{t('stopSession')}</DialogTitle>
				<DialogContent>
					<DialogContentText sx={{ fontSize: '0.85rem' }}>
						{tc('confirmActionBody')}
					</DialogContentText>
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2 }}>
					<Button
						onClick={() => setConfirmClose(false)}
						disabled={closing}
						sx={{ color: 'text.secondary' }}
					>
						{tc('cancel')}
					</Button>
					<Button
						onClick={handleStop}
						disabled={closing}
						variant="contained"
						color="error"
						startIcon={<StopCircleRoundedIcon />}
					>
						{t('stopSession')}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
