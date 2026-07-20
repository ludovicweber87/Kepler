'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import { alpha } from '@mui/material/styles';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import CallMergeRoundedIcon from '@mui/icons-material/CallMergeRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
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
import { useGitStatus } from '@/hooks/useGitStatus';
import { usePullRequests } from '@/hooks/usePullRequests';
import { findOpenPrForBranch } from '@/lib/pullRequests';
import AgentChatTab from '@/components/agents/AgentChatTab';
import RunWorkbench from '@/components/workbench/RunWorkbench';
import WorkbenchShell from '@/components/workbench/WorkbenchShell';
import { FileDiffView } from '@/components/agents/AgentDiffTab';
import ChangedFilesList from '@/components/agents/ChangedFilesList';
import SessionRecap from '@/components/agents/SessionRecap';
import AgentActivityTab from '@/components/agents/AgentActivityTab';
import AgentIssueTab from '@/components/agents/AgentIssueTab';
import TerminalTabs from '@/components/agents/TerminalTabs';
import CreationProgress from '@/components/workbench/CreationProgress';
import FileContentView from '@/components/workbench/FileContentView';
import { matchFileDiff, resolveTabAfterClose, addOpenFile, CHAT_TAB } from '@/lib/workbenchTabs';
import FileTabLabel from '@/components/shared/FileTab';

export default function Workbench() {
	const t = useTranslations('workbench');
	const tc = useTranslations('common');
	const tAgentChat = useTranslations('agentChat');
	const searchParams = useSearchParams();
	const router = useRouter();
	const sessionId = searchParams.get('session') ?? undefined;
	const runId = searchParams.get('run') ?? undefined;

	const { data: allSessions = [] } = useAgentSessionHistory();
	const { session, logs } = useAgentSession(sessionId);
	const { stop, resume } = useSessionActions();
	const queryClient = useQueryClient();
	const overlay = useOverlayTerminal();
	const { showSnackbar } = useSnackbar();

	const [confirmClose, setConfirmClose] = useState(false);
	const [closing, setClosing] = useState(false);
	const firstPromptSent = useRef(false);
	// Armé au clic « reprendre » : demande la relance du dernier prompt user à
	// la réouverture du WS. Consommé (one-shot) par useAgentChat.
	const resumeRetryRef = useRef(false);

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

	// Session lancée depuis une issue (hors pipeline) : premier message auto-envoyé
	// au démarrage du chat. Le serveur ne l'injecte qu'une fois (transcript vide),
	// donc c'est sans effet sur une session qui a déjà une conversation.
	const initialPrompt = useMemo(() => {
		if (!hasIssue || resolved?.pipeline_run_id) return undefined;
		const title = resolved?.issue_title?.trim();
		return title
			? `Résous l'issue #${resolved!.issue_number} : ${title}`
			: `Résous l'issue #${resolved!.issue_number}.`;
	}, [hasIssue, resolved]);

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
		resumeRetryRef.current = false;
	}, [sessionId]);

	const diffPath = resolved?.worktree_path ?? resolved?.project_path ?? null;
	const { files: changedFiles } = useGitDiff(diffPath, resolved?.branch ?? null);
	const { dirty: hasUncommitted } = useGitStatus(diffPath);

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

	// Session archivée : l'onglet Activity disparaît → on dérive un onglet droit valide
	// pour que <Tabs value> corresponde toujours à un <Tab> rendu (évite le warning MUI).
	const effectiveRightTab: RightTab =
		isArchived && rightTab === 'activity' ? 'changes' : rightTab;

	const [prState, setPrState] = useState<{ available: boolean; trigger: () => void }>({
		available: false,
		trigger: () => {},
	});
	const [commitPushState, setCommitPushState] = useState<{
		available: boolean;
		trigger: () => void;
	}>({
		available: false,
		trigger: () => {},
	});

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
	const { data: branchPrs } = usePullRequests(repoFullName ? [repoFullName] : []);
	const openPr = useMemo(() => findOpenPrForBranch(branchPrs, branch), [branchPrs, branch]);
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
						// Le header lit `resolved` qui privilégie cette query : sans invalidation,
						// il resterait sur l'ancien nom `wip-...` jusqu'à ~5 min (staleTime global).
						queryClient.invalidateQueries({ queryKey: ['agent-session', sessionId] });
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

	// Pipeline-run view: same Workbench chrome, with a Workflow tab.
	// `key` remounts on run change → internal tab/file state resets naturally.
	if (runId) {
		return <RunWorkbench key={runId} runId={runId} />;
	}

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
		<>
			<WorkbenchShell
				headerLeft={
					<>
						<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
							{resolved?.agent_name ??
								(bucket === 'active' ? t('activeSession') : t('newSession'))}
						</Typography>
						{branch && (
							<Chip
								icon={
									<AccountTreeRoundedIcon sx={{ fontSize: '14px !important' }} />
								}
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
					</>
				}
				headerActions={
					<>
						{hasUncommitted && commitPushState.available && !isArchived && openPr && (
							<Button
								variant="outlined"
								color="primary"
								size="small"
								startIcon={<PublishRoundedIcon sx={{ fontSize: 16 }} />}
								onClick={() => commitPushState.trigger()}
								sx={{
									textTransform: 'none',
									fontWeight: 600,
									borderRadius: 1,
									px: 1.25,
								}}
							>
								{tAgentChat('commitPush')}
							</Button>
						)}
						{openPr
							? !isArchived && (
									<Button
										component="a"
										href={openPr.html_url}
										target="_blank"
										rel="noopener noreferrer"
										variant="outlined"
										color="primary"
										size="small"
										startIcon={<CallMergeRoundedIcon sx={{ fontSize: 16 }} />}
										sx={{
											textTransform: 'none',
											fontWeight: 600,
											borderRadius: 1,
											px: 1.25,
										}}
									>
										{tAgentChat('viewPr', { number: openPr.number })}
									</Button>
								)
							: prState.available &&
								!isArchived && (
									<Button
										variant="contained"
										color="primary"
										size="small"
										startIcon={<CallMergeRoundedIcon sx={{ fontSize: 16 }} />}
										onClick={() => prState.trigger()}
										sx={{
											textTransform: 'none',
											fontWeight: 600,
											borderRadius: 1,
											px: 1.25,
											boxShadow: 'none',
											'&:hover': {
												boxShadow: 'none',
												bgcolor: 'primary.dark',
											},
										}}
									>
										{tAgentChat('createPr')}
									</Button>
								)}
					</>
				}
				repoLabel={repoLabel}
				stoppable={bucket === 'active'}
				onStop={() => setConfirmClose(true)}
				stopTitle={t('stopSession')}
				onPip={handlePip}
				leftTabValue={activeTab}
				onLeftTabChange={setActiveTab}
				leftTabs={[
					<Tab
						key={CHAT_TAB}
						value={CHAT_TAB}
						label={isArchived ? t('tabRecap') : t('tabChat')}
					/>,
					...openFiles.map((path) => {
						const name = path.split('/').filter(Boolean).pop() ?? path;
						return (
							<Tab
								key={path}
								value={path}
								label={
									<FileTabLabel
										name={name}
										path={path}
										onClose={() => closeFile(path)}
										closeLabel={t('closeFile')}
									/>
								}
							/>
						);
					}),
				]}
				leftContent={
					<>
						{/* Contenu de l'onglet de base : récap (archivé) ou chat (sinon). */}
						{isArchived ? (
							activeTab === CHAT_TAB && (
								<Box sx={{ flex: 1, minHeight: 0 }}>
									<SessionRecap session={resolved} logs={logs} />
								</Box>
							)
						) : (
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
									initialPrompt={initialPrompt}
									readOnly={chatReadOnly}
									createPrPrompt={repoSettings.create_pr_prompt}
									commitPushPrompt={repoSettings.commit_push_prompt}
									resumeRetryRef={resumeRetryRef}
									onResume={() => {
										resumeRetryRef.current = true;
										resume(sessionId).catch(() => {
											resumeRetryRef.current = false;
										});
									}}
									onOpenChanges={openChanges}
									onCreatePrStateChange={setPrState}
									onCommitPushStateChange={setCommitPushState}
									onTurnComplete={() => {
										queryClient.invalidateQueries({ queryKey: ['git-diff'] });
										queryClient.invalidateQueries({ queryKey: ['git-status'] });
										queryClient.invalidateQueries({
											queryKey: ['github', 'prs'],
										});
									}}
									onFirstTurnComplete={(userText, assistantText) => {
										if (isAutoNamed && !firstPromptSent.current) {
											firstPromptSent.current = true;
											const context = assistantText
												? `${userText}\n\n[Réponse de l'agent]\n${assistantText}`
												: userText;
											submitRenameFromPrompt(context);
										}
									}}
								/>
							</Box>
						)}
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
									<FileContentView
										key={activeTab}
										cwd={diffPath}
										path={activeTab}
									/>
								)}
							</Box>
						)}
					</>
				}
				rightTabValue={effectiveRightTab}
				onRightTabChange={(val) => setRightTab(val as RightTab)}
				rightTabs={[
					<Tab
						key="changes"
						value="changes"
						iconPosition="start"
						icon={<DescriptionRoundedIcon sx={{ fontSize: 16 }} />}
						label={
							changedFiles.length > 0
								? `${t('tabChanges')} (${changedFiles.length})`
								: t('tabChanges')
						}
					/>,
					!isArchived && (
						<Tab
							key="activity"
							value="activity"
							iconPosition="start"
							icon={<TimelineRoundedIcon sx={{ fontSize: 16 }} />}
							label={t('chipActivity')}
						/>
					),
					hasIssue && (
						<Tab
							key="issue"
							value="issue"
							iconPosition="start"
							icon={<BugReportRoundedIcon sx={{ fontSize: 16 }} />}
							label={t('chipIssue')}
						/>
					),
				]}
				rightContent={
					<>
						{effectiveRightTab === 'changes' && (
							<ChangedFilesList
								changedFiles={changedFiles}
								onOpenFile={openChanges}
							/>
						)}
						{effectiveRightTab === 'activity' && !isArchived && (
							<AgentActivityTab session={resolved} logs={logs} />
						)}
						{effectiveRightTab === 'issue' && hasIssue && (
							<AgentIssueTab
								owner={resolved!.issue_owner!}
								repo={resolved!.issue_repo!}
								issueNumber={resolved!.issue_number!}
							/>
						)}
					</>
				}
				terminal={
					<TerminalTabs
						key={sessionId}
						sessionId={sessionId}
						cwd={effectivePath}
						ready={!!resolved}
						autoStart={!isArchived}
					/>
				}
			/>

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
		</>
	);
}
