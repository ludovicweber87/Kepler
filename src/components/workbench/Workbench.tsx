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
import FolderCopyRoundedIcon from '@mui/icons-material/FolderCopyRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import CallMergeRoundedIcon from '@mui/icons-material/CallMergeRounded';
import MergeRoundedIcon from '@mui/icons-material/MergeRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import { useTranslations } from 'next-intl';
import { useAgentSessionHistory, useAgentSession } from '@/hooks/useAgentSession';
import { useSessionActions } from '@/hooks/useSessionActions';
import { useMarkSessionRead } from '@/hooks/useMarkSessionRead';
import { useOverlayTerminal } from '@/hooks/useOverlayTerminal';
import { useScriptRunner } from '@/hooks/useScriptRunner';
import { useSnackbar } from '@/hooks/useSnackbar';
import { classifySession } from '@/lib/sessionStatus';
import { resolveEffectivePath } from '@/lib/effectivePath';
import { resolveRepoFullName } from '@/lib/resolveRepoFullName';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useRepoSettings } from '@/hooks/useRepoSettings';
import { useGitDiff } from '@/hooks/useGitDiff';
import { useGitStatus } from '@/hooks/useGitStatus';
import { usePullRequests } from '@/hooks/usePullRequests';
import { useMergedBranches } from '@/hooks/useMergedBranches';
import { findOpenPrForBranch, findMergedPrForBranch } from '@/lib/pullRequests';
import AgentChatTab from '@/components/agents/AgentChatTab';
import WorkbenchShell from '@/components/workbench/WorkbenchShell';
import { FileDiffView } from '@/components/agents/AgentDiffTab';
import ChangedFilesList from '@/components/agents/ChangedFilesList';
import SessionRecap from '@/components/agents/SessionRecap';
import AgentActivityTab from '@/components/agents/AgentActivityTab';
import AgentActivityReaderTab from '@/components/agents/AgentActivityReaderTab';
import AgentIssueTab from '@/components/agents/AgentIssueTab';
import TerminalTabs, { type TerminalTabsHandle } from '@/components/agents/TerminalTabs';
import CreationProgress from '@/components/workbench/CreationProgress';
import FileContentView from '@/components/workbench/FileContentView';
import FileExplorerTab from '@/components/workbench/FileExplorerTab';
import EditableSessionName from '@/components/workbench/EditableSessionName';
import {
	matchFileDiff,
	resolveTabAfterClose,
	addOpenFile,
	isSessionTab,
	CHAT_TAB,
	READER_TAB,
} from '@/lib/workbenchTabs';
import FileTabLabel from '@/components/shared/FileTab';

export default function Workbench() {
	const t = useTranslations('workbench');
	const tc = useTranslations('common');
	const tAgentChat = useTranslations('agentChat');
	const searchParams = useSearchParams();
	const router = useRouter();
	const sessionId = searchParams.get('session') ?? undefined;
	// La session est à l'écran : ses notifs n'ont plus à porter de pastille.
	useMarkSessionRead(sessionId);

	const { data: allSessions = [] } = useAgentSessionHistory();
	const { session, logs, updatePersona } = useAgentSession(sessionId);
	const { stop, resume } = useSessionActions();
	const queryClient = useQueryClient();
	const overlay = useOverlayTerminal();
	const { showSnackbar } = useSnackbar();

	const [confirmClose, setConfirmClose] = useState(false);
	const [closing, setClosing] = useState(false);
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
		if (!hasIssue) return undefined;
		const title = resolved?.issue_title?.trim();
		return title
			? `Résous l'issue #${resolved!.issue_number} : ${title}`
			: `Résous l'issue #${resolved!.issue_number}.`;
	}, [hasIssue, resolved]);

	type RightTab = 'changes' | 'activity' | 'explorer' | 'issue';
	const [rightTab, setRightTab] = useState<RightTab>('activity');
	// Le lecteur markdown du flux d'activité n'apparaît qu'après clic sur « Voir ».
	// C'est un onglet gauche (pleine largeur), pas un onglet du panneau droit.
	const [readerOpen, setReaderOpen] = useState(false);

	useEffect(() => {
		if (rightTab === 'issue' && !hasIssue) setRightTab('activity');
	}, [rightTab, hasIssue]);

	// Onglets gauche : 'chat', le lecteur d'activité optionnel, puis un chemin de
	// fichier par onglet ouvert.
	const [openFiles, setOpenFiles] = useState<string[]>([]);
	const [activeTab, setActiveTab] = useState<string>(CHAT_TAB);
	const [focusNonce, setFocusNonce] = useState(0);

	useEffect(() => {
		setOpenFiles([]);
		setActiveTab(CHAT_TAB);
		setRightTab('activity');
		setReaderOpen(false);
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

	const openReader = useCallback(() => {
		setReaderOpen(true);
		setActiveTab(READER_TAB);
	}, []);

	const closeReader = useCallback(() => {
		setReaderOpen(false);
		setActiveTab((active) => (active === READER_TAB ? CHAT_TAB : active));
	}, []);

	const activeFileDiff = isSessionTab(activeTab)
		? undefined
		: matchFileDiff(changedFiles, activeTab);

	// Le lecteur est ouvert via « Voir » dans l'onglet Activity, masqué en session
	// archivée : on aligne sa disponibilité dessus pour ne pas laisser un onglet
	// orphelin si la session est archivée pendant la lecture.
	const readerVisible = readerOpen && !isArchived;

	useEffect(() => {
		if (!readerVisible) {
			setActiveTab((active) => (active === READER_TAB ? CHAT_TAB : active));
		}
	}, [readerVisible]);

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

	// Cibles d'exécution des scripts de la topbar. En `useState` et non en `ref` :
	// l'effet consommateur doit se rejouer quand une cible devient disponible
	// (changement de session, reconnexion du chat) alors qu'un script attend déjà.
	const [chatSend, setChatSend] = useState<((text: string) => void) | null>(null);
	const [terminalApi, setTerminalApi] = useState<TerminalTabsHandle | null>(null);

	// Identités stables : passées en callback ref / prop d'effet, une nouvelle
	// identité à chaque render relancerait l'enregistrement en boucle.
	const handleSendReady = useCallback(
		(send: ((text: string) => void) | null) => setChatSend(() => send),
		[],
	);
	const handleTerminalRef = useCallback(
		(api: TerminalTabsHandle | null) => setTerminalApi(api),
		[],
	);

	// Exécute le script cliqué dans la topbar. Tant que la cible n'est pas prête,
	// l'action reste en attente dans le contexte et l'effet se rejoue.
	const { pending: pendingScript, consume: consumeScript } = useScriptRunner();
	useEffect(() => {
		if (!pendingScript || pendingScript.sessionId !== sessionId) return;
		if (pendingScript.mode === 'chat') {
			if (!chatSend) return;
			chatSend(pendingScript.script);
		} else {
			if (!terminalApi) return;
			terminalApi.openWithCommand(pendingScript.script, pendingScript.name);
		}
		consumeScript();
	}, [pendingScript, sessionId, chatSend, terminalApi, consumeScript]);

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
	const { mergedPrsForRepo } = useMergedBranches(repoFullName ? [repoFullName] : []);
	const openPr = useMemo(() => findOpenPrForBranch(branchPrs, branch), [branchPrs, branch]);
	// Priorité : une PR ouverte prime sur une PR mergée (cas d'une PR ré-ouverte après merge).
	const mergedPr = useMemo(
		() =>
			openPr || !repoFullName
				? undefined
				: findMergedPrForBranch(mergedPrsForRepo(repoFullName), branch),
		[openPr, repoFullName, mergedPrsForRepo, branch],
	);
	const repoLabel =
		resolved?.project_name ?? resolved?.project_path?.split('/').filter(Boolean).pop() ?? '';

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
		<>
			<WorkbenchShell
				headerLeft={
					<>
						{resolved?.agent_color && (
							<Box
								sx={{
									width: 10,
									height: 10,
									borderRadius: '50%',
									bgcolor: resolved.agent_color,
									flexShrink: 0,
								}}
							/>
						)}
						<EditableSessionName
							value={resolved?.agent_name}
							fallback={bucket === 'active' ? t('activeSession') : t('newSession')}
							onRename={(name) => updatePersona({ agent_name: name })}
							disabled={!session}
						/>
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
						{openPr ? (
							!isArchived && (
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
						) : mergedPr ? (
							<Button
								component="a"
								href={mergedPr.html_url}
								target="_blank"
								rel="noopener noreferrer"
								variant="outlined"
								color="primary"
								size="small"
								startIcon={
									<MergeRoundedIcon
										sx={{ fontSize: 16, color: 'primary.main' }}
									/>
								}
								sx={{
									textTransform: 'none',
									fontWeight: 600,
									borderRadius: 1,
									px: 1.25,
								}}
							>
								{tAgentChat('merged', { number: mergedPr.number })}
							</Button>
						) : (
							prState.available &&
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
							)
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
					readerVisible && (
						<Tab
							key={READER_TAB}
							value={READER_TAB}
							label={
								<FileTabLabel
									name={t('chipReader')}
									onClose={closeReader}
									closeLabel={t('closeReader')}
								/>
							}
						/>
					),
					...openFiles.map((path) => {
						const name = path.split('/').filter(Boolean).pop() ?? path;
						return (
							<Tab
								key={path}
								value={path}
								label={
									<FileTabLabel
										name={name}
										tooltip={path}
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
									initialModel={resolved?.model ?? undefined}
									initialEffort={resolved?.effort ?? undefined}
									initialMode={resolved?.permission_mode ?? undefined}
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
									onSendReady={handleSendReady}
									onTurnComplete={() => {
										queryClient.invalidateQueries({ queryKey: ['git-diff'] });
										queryClient.invalidateQueries({ queryKey: ['git-status'] });
										queryClient.invalidateQueries({ queryKey: ['file-tree'] });
										queryClient.invalidateQueries({
											queryKey: ['github', 'prs'],
										});
									}}
								/>
							</Box>
						)}
						{activeTab === READER_TAB && readerVisible && (
							<Box sx={{ flex: 1, minHeight: 0 }}>
								<AgentActivityReaderTab logs={logs} />
							</Box>
						)}
						{!isSessionTab(activeTab) && (
							<Box
								sx={{
									flex: 1,
									minHeight: 0,
									overflowY: 'auto',
									overflowX: 'hidden',
								}}
							>
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
					<Tab
						key="explorer"
						value="explorer"
						iconPosition="start"
						icon={<FolderCopyRoundedIcon sx={{ fontSize: 16 }} />}
						label={t('chipExplorer')}
					/>,
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
							<AgentActivityTab
								session={resolved}
								logs={logs}
								onOpenReader={openReader}
							/>
						)}
						{effectiveRightTab === 'explorer' && (
							<FileExplorerTab
								cwd={diffPath}
								activePath={isSessionTab(activeTab) ? null : activeTab}
								onOpenFile={openChanges}
							/>
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
						ref={handleTerminalRef}
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
