'use client';

import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { usePipelineRun } from '@/hooks/usePipelineRun';
import { usePersonaGroup } from '@/hooks/usePersonaGroups';
import { usePersonas } from '@/hooks/usePersonas';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAgentSession } from '@/hooks/useAgentSession';
import { useGitDiff } from '@/hooks/useGitDiff';
import { matchFileDiff, resolveTabAfterClose, addOpenFile, CHAT_TAB } from '@/lib/workbenchTabs';
import WorkbenchShell from '@/components/workbench/WorkbenchShell';
import RunChatTab from '@/components/workbench/RunChatTab';
import RunWorkflowGraph from '@/components/workbench/RunWorkflowGraph';
import ChatComposer from '@/components/agents/chat/ChatComposer';
import { FileDiffView } from '@/components/agents/AgentDiffTab';
import ChangedFilesList from '@/components/agents/ChangedFilesList';
import FileContentView from '@/components/workbench/FileContentView';
import AgentActivityTab from '@/components/agents/AgentActivityTab';
import AgentIssueTab from '@/components/agents/AgentIssueTab';
import TerminalTabs from '@/components/agents/TerminalTabs';
import type { Persona } from '@/types';

const WORKFLOW_TAB = '__workflow__';

type RightTab = 'changes' | 'activity' | 'issue';

export default function RunWorkbench({ runId }: { runId: string }) {
	const t = useTranslations('workbench');
	const tp = useTranslations('personas');
	const { run, continueRun, stopRun } = usePipelineRun(runId);
	const { data: group } = usePersonaGroup(run?.group_id);
	const { personas } = usePersonas();

	const personasById = useMemo(() => {
		const m = new Map<string, Persona>();
		for (const p of personas) m.set(p.id, p);
		return m;
	}, [personas]);

	const [activeTab, setActiveTab] = useState<string>(CHAT_TAB);
	const [openFiles, setOpenFiles] = useState<string[]>([]);
	const [rightTab, setRightTab] = useState<RightTab>('activity');
	const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
	const [focusNonce, setFocusNonce] = useState(0);

	const cwd = run?.worktree_path ?? run?.project_path ?? null;
	const branch = run?.branch ?? null;
	const { files: changedFiles } = useGitDiff(cwd, branch);

	const hasIssue = !!(run?.issue_owner && run?.issue_repo && run?.issue_number);
	// Onglet droit effectif : l'onglet Issue n'existe pas sans issue → on dérive une
	// valeur valide pour que <Tabs value> corresponde toujours à un <Tab> rendu.
	const effectiveRightTab: RightTab = rightTab === 'issue' && !hasIssue ? 'activity' : rightTab;

	// Step en cours (persona active) : cible du composer + source de l'onglet Activity.
	const steps = useMemo(
		() => [...(run?.steps ?? [])].sort((a, b) => a.seq - b.seq),
		[run?.steps],
	);
	const activeStep = useMemo(
		() => steps.find((s) => s.status === 'running' && s.session_id) ?? null,
		[steps],
	);
	const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
	const activeStepSessionId = activeStep?.session_id ?? null;
	const activityStepSessionId = activeStepSessionId ?? lastStep?.session_id ?? undefined;

	const runLive = run?.status === 'running';
	const composerEnabled = !!runLive && !!activeStepSessionId;

	// Chat "send-only" attaché à la session du step actif (observateur : ne crée jamais
	// de session). Rendu par RunChatTab/LiveStepChat ; ce hook sert le composer.
	const composerChat = useAgentChat({
		sessionId: activeStepSessionId ?? '',
		cwd,
		enabled: composerEnabled,
		observeOnly: true,
	});

	// Onglet Activity : logs de la session du step actif (ou du dernier).
	const { session: activitySession, logs: activityLogs } = useAgentSession(activityStepSessionId);

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

	const isFileTab = activeTab !== CHAT_TAB && activeTab !== WORKFLOW_TAB;
	const activeFileDiff = isFileTab ? matchFileDiff(changedFiles, activeTab) : undefined;

	if (!run) return null;

	const repoLabel = run.project_name ?? run.project_path?.split('/').filter(Boolean).pop() ?? '';
	const stoppable = run.status === 'running' || run.status === 'paused';
	const composerBusy = composerChat.status === 'busy';

	return (
		<WorkbenchShell
			headerLeft={
				<>
					<Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
						{run.group_name}
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
					<Chip
						size="small"
						label={run.status}
						color={
							run.status === 'running'
								? 'primary'
								: run.status === 'paused'
									? 'warning'
									: run.status === 'completed'
										? 'success'
										: 'default'
						}
						sx={{ height: 22, fontSize: '0.65rem' }}
					/>
				</>
			}
			headerActions={
				run.status === 'paused' ? (
					<Button
						size="small"
						variant="contained"
						startIcon={<PlayArrowRoundedIcon sx={{ fontSize: 16 }} />}
						onClick={() => continueRun.mutate()}
						sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1, px: 1.25 }}
					>
						{tp('runContinue')}
					</Button>
				) : undefined
			}
			repoLabel={repoLabel}
			stoppable={stoppable}
			onStop={() => stopRun.mutate()}
			stopTitle={tp('runStop')}
			leftTabValue={activeTab}
			onLeftTabChange={setActiveTab}
			leftTabs={
				<>
					<Tab value={CHAT_TAB} label={t('tabRunChat')} />
					<Tab value={WORKFLOW_TAB} label={t('tabWorkflow')} />
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
				</>
			}
			leftContent={
				<>
					{/* Chat agrégé multi-persona + composer (injection sur la persona active). */}
					<Box
						sx={{
							flex: 1,
							minHeight: 0,
							display: activeTab === CHAT_TAB ? 'flex' : 'none',
							flexDirection: 'column',
							bgcolor: 'background.default',
						}}
					>
						<Box sx={{ flex: 1, minHeight: 0 }}>
							<RunChatTab run={run} cwd={cwd} focusNodeId={focusNodeId} />
						</Box>
						{composerEnabled ? (
							<ChatComposer
								disabled={
									composerChat.status === 'connecting' ||
									composerChat.status === 'closed' ||
									composerChat.status === 'error'
								}
								busy={composerBusy}
								model={composerChat.model}
								effort={composerChat.effort}
								permissionMode={composerChat.permissionMode}
								onSend={composerChat.send}
								onStop={composerChat.interrupt}
								onModel={composerChat.setModel}
								onEffort={composerChat.setEffort}
								onMode={composerChat.setPermissionMode}
							/>
						) : (
							<Box
								sx={{
									p: 1.5,
									borderTop: 1,
									borderColor: 'divider',
									textAlign: 'center',
								}}
							>
								<Typography variant="caption" sx={{ color: 'text.secondary' }}>
									{t('runComposerDisabled')}
								</Typography>
							</Box>
						)}
					</Box>

					{/* Workflow : graphe react-flow (monté en permanence pour garder l'état). */}
					<Box
						sx={{
							flex: 1,
							minHeight: 0,
							display: activeTab === WORKFLOW_TAB ? 'block' : 'none',
						}}
					>
						{group && (
							<RunWorkflowGraph
								run={run}
								group={group}
								personasById={personasById}
								onNodeClick={(nodeId) => {
									setFocusNodeId(nodeId);
									setActiveTab(CHAT_TAB);
								}}
							/>
						)}
					</Box>

					{/* Fichier ouvert. */}
					{isFileTab && (
						<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
							{activeFileDiff ? (
								<FileDiffView
									key={activeTab}
									file={activeFileDiff}
									focused
									focusNonce={focusNonce}
								/>
							) : (
								<FileContentView key={activeTab} cwd={cwd} path={activeTab} />
							)}
						</Box>
					)}
				</>
			}
			rightTabValue={effectiveRightTab}
			onRightTabChange={(val) => setRightTab(val as RightTab)}
			rightTabs={
				<>
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
				</>
			}
			rightContent={
				<>
					{effectiveRightTab === 'changes' && (
						<ChangedFilesList changedFiles={changedFiles} onOpenFile={openChanges} />
					)}
					{effectiveRightTab === 'activity' && (
						<AgentActivityTab session={activitySession ?? null} logs={activityLogs} />
					)}
					{effectiveRightTab === 'issue' && hasIssue && (
						<AgentIssueTab
							owner={run.issue_owner!}
							repo={run.issue_repo!}
							issueNumber={run.issue_number!}
						/>
					)}
				</>
			}
			terminal={
				<TerminalTabs key={runId} sessionId={runId} cwd={cwd} ready={!!run} autoStart />
			}
		/>
	);
}
