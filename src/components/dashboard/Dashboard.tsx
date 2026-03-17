'use client';

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveSessions, type ActiveSession } from '@/hooks/useActiveSessions';
import { useAgentSessionHistory, type AgentSession } from '@/hooks/useAgentSession';
import { useAgentSummaries, type AgentSummary } from '@/hooks/useRecentLogs';
import { usePendingTodoCount } from '@/hooks/usePendingTodoCount';
import { usePendingQuestions } from '@/hooks/usePendingQuestions';
import { useDashboard } from '@/hooks/useGitHub';
import { usePullRequests } from '@/hooks/usePullRequests';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useSessionManager } from '@/hooks/useSessionManager';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import KpiCards from './KpiCards';
import ActiveAgentsWidget from './ActiveAgentsWidget';
import TodosWidget from './TodosWidget';
import RecentSessionsWidget from './RecentSessionsWidget';
import SummariesWidget from './SummariesWidget';
import AllReportsDialog from './AllReportsDialog';

const AgentTerminalModal = dynamic(() => import('@/components/agents/AgentTerminalModal'), {
	ssr: false,
});

type SelectedItem =
	| { type: 'active'; session: ActiveSession }
	| { type: 'past'; session: AgentSession };

function repoShortName(fullName: string): string {
	const parts = fullName.split('/');
	return parts[parts.length - 1];
}

function matchesRepo(projectName: string, projectPath: string, repo: string): boolean {
	const short = repoShortName(repo);
	return projectName === short || projectName === repo || projectPath.includes(short);
}

export default function Dashboard() {
	const t = useTranslations('dashboard');
	const queryClient = useQueryClient();

	const [repoTab, setRepoTab] = useState(0);
	const [selected, setSelected] = useState<SelectedItem | null>(null);
	const [showAllReports, setShowAllReports] = useState(false);

	// Data hooks
	const { data: sessions = [] } = useActiveSessions();
	const { data: pastSessions = [] } = useAgentSessionHistory();
	const { data: summaries = [], isLoading: summariesLoading } = useAgentSummaries();
	const pendingCount = usePendingTodoCount();
	const pendingQuestions = usePendingQuestions();
	const { data: dashboardData } = useDashboard();
	const { repoPaths } = useRepoPaths();
	const { deleteSession } = useSessionManager();
	const repos = useMemo(() => repoPaths.map((r) => r.repo_full_name), [repoPaths]);
	const { data: prs = [] } = usePullRequests(repos);

	// Selected repo for filtering (null = all)
	const selectedRepo = repoTab === 0 ? null : (repos[repoTab - 1] ?? null);

	// Filtered sessions (exclude active from past, filter by repo)
	const activeSessionIds = useMemo(() => new Set(sessions.map((s) => s.sessionId)), [sessions]);

	const filteredActiveSessions = useMemo(() => {
		if (!selectedRepo) return sessions;
		return sessions.filter((s) => matchesRepo(s.projectName, s.cwd, selectedRepo));
	}, [sessions, selectedRepo]);

	const filteredPastSessions = useMemo(() => {
		let result = pastSessions.filter((s) => !activeSessionIds.has(s.session_id));
		if (selectedRepo) {
			result = result.filter((s) =>
				matchesRepo(s.project_name, s.project_path, selectedRepo),
			);
		}
		return result.slice(0, 8);
	}, [pastSessions, activeSessionIds, selectedRepo]);

	// Filtered summaries
	const filteredSummaries = useMemo(() => {
		let result = summaries;
		if (selectedRepo) {
			result = result.filter((s) =>
				matchesRepo(s.project_name, s.project_path, selectedRepo),
			);
		}
		return result.slice(0, 10);
	}, [summaries, selectedRepo]);

	// KPI data
	const openIssuesCount = useMemo(() => {
		return dashboardData?.issues?.filter((i) => i.state === 'open').length ?? 0;
	}, [dashboardData]);

	// Handlers
	const handleKillSession = useCallback(
		async (sessionId: string) => {
			try {
				await fetch(`/api/agent-sessions/${encodeURIComponent(sessionId)}/kill`, {
					method: 'POST',
				});
				queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
				queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
			} catch {
				// ignore
			}
		},
		[queryClient],
	);

	const handleSummaryClick = useCallback(
		(summary: AgentSummary) => {
			const match = pastSessions.find((s) => s.session_id === summary.session_id);
			if (match) setSelected({ type: 'past', session: match });
		},
		[pastSessions],
	);

	const handlePastSessionClick = useCallback((session: AgentSession) => {
		setSelected({ type: 'past', session });
	}, []);

	// Modal props
	const modalOpen = !!selected;
	const modalProps =
		selected?.type === 'active'
			? {
					projectPath: selected.session.cwd,
					existingSessionId: selected.session.sessionId,
				}
			: selected?.type === 'past'
				? {
						projectPath: selected.session.project_path || undefined,
						existingSessionId: selected.session.session_id,
						isPastSession: true,
					}
				: {};

	return (
		<>
			<Box sx={{ p: 4, maxWidth: 1200, mx: 'auto', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
				{/* Header */}
				<Box
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						mb: 3,
						flexShrink: 0,
					}}
				>
					<Typography variant="h4" sx={{ fontWeight: 700 }}>
						{t('title')}
					</Typography>
					<Tabs
						value={repoTab}
						onChange={(_, val) => setRepoTab(val)}
						variant="scrollable"
						scrollButtons="auto"
						sx={{
							minHeight: 32,
							bgcolor: 'background.paper',
							border: 1,
							borderColor: 'divider',
							borderRadius: '8px',
							'& .MuiTabs-indicator': {
								display: 'none',
							},
							'& .MuiTab-root': {
								minHeight: 32,
								border: 'none',
								borderRadius: '6px',
								px: 2,
								py: 0.5,
								fontSize: '0.75rem',
								fontWeight: 500,
								textTransform: 'none',
								color: 'text.secondary',
								minWidth: 'auto',
								'&.Mui-selected': {
									bgcolor: 'primary.main',
									color: '#fff',
								},
							},
						}}
					>
						<Tab label={t('allRepos')} />
						{repos.map((repo) => (
							<Tab key={repo} label={repoShortName(repo)} />
						))}
					</Tabs>
				</Box>

				{/* KPI Cards */}
				<Box sx={{ mb: 2, flexShrink: 0 }}>
					<KpiCards
						activeAgents={filteredActiveSessions.length}
						openIssues={openIssuesCount}
						pendingPrs={prs.length}
						pendingTodos={pendingCount}
					/>
				</Box>

				{/* Main Grid 2x2 */}
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: '1fr 1fr',
						gridTemplateRows: 'auto 1fr',
						gap: 2,
						flex: 1,
						minHeight: 0,
					}}
				>
					<ActiveAgentsWidget
						sessions={filteredActiveSessions}
						pendingQuestions={pendingQuestions}
						onSessionClick={(s) => setSelected({ type: 'active', session: s })}
						onStopSession={handleKillSession}
					/>
					<TodosWidget pendingCount={pendingCount} />
					<RecentSessionsWidget
						sessions={filteredPastSessions}
						onSessionClick={handlePastSessionClick}
						onDeleteSession={deleteSession}
					/>
					<SummariesWidget
						summaries={filteredSummaries}
						isLoading={summariesLoading}
						onSessionClick={handleSummaryClick}
						onShowAll={() => setShowAllReports(true)}
					/>
				</Box>
			</Box>

			{/* Terminal modal */}
			<AgentTerminalModal
				open={modalOpen}
				onClose={() => setSelected(null)}
				{...modalProps}
			/>

			{/* All reports dialog */}
			<AllReportsDialog
				open={showAllReports}
				onClose={() => setShowAllReports(false)}
				summaries={summaries}
				repos={repos}
				onSessionClick={(summary) => {
					setShowAllReports(false);
					handleSummaryClick(summary);
				}}
			/>
		</>
	);
}
