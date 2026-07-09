'use client';

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useAgentSessionHistory, type AgentSession } from '@/hooks/useAgentSession';
import { useSessionActions } from '@/hooks/useSessionActions';
import { useAgentSummaries, type AgentSummary } from '@/hooks/useRecentLogs';
import { usePendingQuestions } from '@/hooks/usePendingQuestions';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { classifySession } from '@/lib/sessionStatus';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import ActiveAgentsWidget from './ActiveAgentsWidget';
import RecentSessionsWidget from './RecentSessionsWidget';
import SummariesWidget from './SummariesWidget';
import AllReportsDialog from './AllReportsDialog';

const AgentTerminalModal = dynamic(() => import('@/components/agents/AgentTerminalModal'), {
	ssr: false,
});

function repoShortName(fullName: string): string {
	const parts = fullName.split('/');
	return parts[parts.length - 1];
}

function matchesRepo(projectName: string, projectPath: string, repo: string): boolean {
	const short = repoShortName(repo).toLowerCase();
	const name = projectName.toLowerCase();
	const path = projectPath.toLowerCase();
	return name === short || name === repo.toLowerCase() || path.includes(short);
}

export default function Dashboard() {
	const t = useTranslations('dashboard');

	const [repoTab, setRepoTab] = useState(0);
	const [selected, setSelected] = useState<AgentSession | null>(null);
	const [showAllReports, setShowAllReports] = useState(false);

	// Data hooks — DB history is the single source of truth for buckets.
	const { data: allSessions = [] } = useAgentSessionHistory();
	const { data: summaries = [], isLoading: summariesLoading } = useAgentSummaries();
	const pendingQuestions = usePendingQuestions();
	const { repoPaths } = useRepoPaths();
	const { stop } = useSessionActions();
	const repos = useMemo(() => repoPaths.map((r) => r.repo_full_name), [repoPaths]);

	// Selected repo for filtering (null = all)
	const selectedRepo = repoTab === 0 ? null : (repos[repoTab - 1] ?? null);

	const matchRepo = useCallback(
		(s: AgentSession) =>
			!selectedRepo || matchesRepo(s.project_name ?? '', s.project_path ?? '', selectedRepo),
		[selectedRepo],
	);

	const filteredActiveSessions = useMemo(
		() => allSessions.filter((s) => classifySession(s) === 'active').filter(matchRepo),
		[allSessions, matchRepo],
	);

	const filteredPastSessions = useMemo(() => {
		let result = allSessions.filter((s) => classifySession(s) === 'past').filter(matchRepo);
		// Dédoublonne par worktree : plusieurs ouvertures d'un même worktree créent
		// plusieurs lignes DB. On garde la plus récente (liste déjà triée desc).
		const seen = new Set<string>();
		result = result.filter((s) => {
			const key = s.worktree_path ?? s.branch ?? s.session_id;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		return result.slice(0, 8);
	}, [allSessions, matchRepo]);

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

	// Handlers — the modal derives editable/read-only from the session's DB status.
	const handleSummaryClick = useCallback(
		(summary: AgentSummary) => {
			const match = allSessions.find((s) => s.session_id === summary.session_id);
			if (match) setSelected(match);
		},
		[allSessions],
	);

	// Modal props
	const modalOpen = !!selected;
	const modalProps = selected
		? {
				projectPath: selected.project_path || selected.worktree_path || undefined,
				existingSessionId: selected.session_id,
			}
		: {};

	return (
		<>
			<Box
				sx={{
					p: 4,
					maxWidth: 1200,
					mx: 'auto',
					height: '100vh',
					display: 'flex',
					flexDirection: 'column',
					gap: 2,
					overflow: 'hidden',
				}}
			>
				{/* Header */}
				<Box
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
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

				{/* Top row: Active Agents + Recent Sessions */}
				<Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
					<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
						<ActiveAgentsWidget
							sessions={filteredActiveSessions}
							pendingQuestions={pendingQuestions}
							onSessionClick={(s) => setSelected(s)}
							onStopSession={(sessionId) => stop(sessionId)}
						/>
					</Box>
					<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
						<RecentSessionsWidget
							sessions={filteredPastSessions}
							onSessionClick={(s) => setSelected(s)}
						/>
					</Box>
				</Box>

				{/* Bottom: Summaries full width */}
				<Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
