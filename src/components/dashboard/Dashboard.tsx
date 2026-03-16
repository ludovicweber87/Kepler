'use client';

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { alpha, useTheme } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useActiveSessions, type ActiveSession } from '@/hooks/useActiveSessions';
import { useAgentSessionHistory, type AgentSession } from '@/hooks/useAgentSession';
import { useAgentSummaries, type AgentSummary } from '@/hooks/useRecentLogs';
import { usePendingTodoCount } from '@/hooks/usePendingTodoCount';
import { usePendingQuestions } from '@/hooks/usePendingQuestions';
import { useDashboard } from '@/hooks/useGitHub';
import { usePullRequests } from '@/hooks/usePullRequests';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import KpiCards from './KpiCards';
import ActiveAgentsWidget from './ActiveAgentsWidget';
import TodosWidget from './TodosWidget';
import RecentSessionsWidget from './RecentSessionsWidget';
import SummariesWidget from './SummariesWidget';

const AgentTerminalModal = dynamic(() => import('@/components/agents/AgentTerminalModal'), {
	ssr: false,
});

type TimeFilter = 'today' | '7d' | '30d';

type SelectedItem =
	| { type: 'active'; session: ActiveSession }
	| { type: 'past'; session: AgentSession };

function getFilterDate(filter: TimeFilter): Date {
	const now = new Date();
	switch (filter) {
		case 'today': {
			const d = new Date(now);
			d.setHours(0, 0, 0, 0);
			return d;
		}
		case '7d':
			return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		case '30d':
			return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	}
}

export default function Dashboard() {
	const theme = useTheme();
	const t = useTranslations('dashboard');
	const queryClient = useQueryClient();

	const [timeFilter, setTimeFilter] = useState<TimeFilter>('7d');
	const [selected, setSelected] = useState<SelectedItem | null>(null);

	// Data hooks
	const { data: sessions = [] } = useActiveSessions();
	const { data: pastSessions = [] } = useAgentSessionHistory();
	const { data: summaries = [], isLoading: summariesLoading } = useAgentSummaries();
	const pendingCount = usePendingTodoCount();
	const pendingQuestions = usePendingQuestions();
	const { data: dashboardData } = useDashboard();
	const { repoPaths } = useRepoPaths();
	const repos = useMemo(() => repoPaths.map((r) => r.repo_full_name), [repoPaths]);
	const { data: prs = [] } = usePullRequests(repos);

	// Filter date
	const filterDate = useMemo(() => getFilterDate(timeFilter), [timeFilter]);

	// Filtered sessions (exclude active from past)
	const activeSessionIds = useMemo(() => new Set(sessions.map((s) => s.sessionId)), [sessions]);
	const filteredPastSessions = useMemo(() => {
		return pastSessions
			.filter((s) => !activeSessionIds.has(s.session_id))
			.filter((s) => new Date(s.started_at) >= filterDate)
			.slice(0, 8);
	}, [pastSessions, activeSessionIds, filterDate]);

	// Filtered summaries
	const filteredSummaries = useMemo(() => {
		return summaries
			.filter((s) => new Date(s.started_at) >= filterDate)
			.slice(0, 10);
	}, [summaries, filterDate]);

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

	const handlePastSessionClick = useCallback(
		(session: AgentSession) => {
			setSelected({ type: 'past', session });
		},
		[],
	);

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
			<Box sx={{ p: 4, maxWidth: 1200, mx: 'auto' }}>
				{/* Header */}
				<Box
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						mb: 3,
					}}
				>
					<Typography variant="h4" sx={{ fontWeight: 700 }}>
						{t('title')}
					</Typography>
					<ToggleButtonGroup
						value={timeFilter}
						exclusive
						onChange={(_, val) => val && setTimeFilter(val)}
						size="small"
						sx={{
							bgcolor: 'background.paper',
							border: 1,
							borderColor: 'divider',
							borderRadius: '8px',
							'& .MuiToggleButton-root': {
								border: 'none',
								borderRadius: '6px !important',
								px: 2,
								py: 0.5,
								fontSize: '0.75rem',
								fontWeight: 500,
								textTransform: 'none',
								color: 'text.secondary',
								'&.Mui-selected': {
									bgcolor: 'primary.main',
									color: '#fff',
									'&:hover': {
										bgcolor: 'primary.dark',
									},
								},
							},
						}}
					>
						<ToggleButton value="today">{t('filterToday')}</ToggleButton>
						<ToggleButton value="7d">{t('filter7d')}</ToggleButton>
						<ToggleButton value="30d">{t('filter30d')}</ToggleButton>
					</ToggleButtonGroup>
				</Box>

				{/* KPI Cards */}
				<Box sx={{ mb: 2 }}>
					<KpiCards
						activeAgents={sessions.length}
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
						gap: 2,
					}}
				>
					<ActiveAgentsWidget
						sessions={sessions}
						pendingQuestions={pendingQuestions}
						onSessionClick={(s) => setSelected({ type: 'active', session: s })}
						onStopSession={handleKillSession}
					/>
					<TodosWidget pendingCount={pendingCount} />
					<RecentSessionsWidget
						sessions={filteredPastSessions}
						onSessionClick={handlePastSessionClick}
					/>
					<SummariesWidget
						summaries={filteredSummaries}
						isLoading={summariesLoading}
						onSessionClick={handleSummaryClick}
					/>
				</Box>
			</Box>

			{/* Terminal modal */}
			<AgentTerminalModal
				open={modalOpen}
				onClose={() => setSelected(null)}
				{...modalProps}
			/>
		</>
	);
}
