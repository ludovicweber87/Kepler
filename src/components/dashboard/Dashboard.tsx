'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import Collapse from '@mui/material/Collapse';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import Timeline from '@mui/lab/Timeline';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useActiveSessions, type ActiveSession } from '@/hooks/useActiveSessions';
import { useAgentSessionHistory, type AgentSession } from '@/hooks/useAgentSession';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useAgentSummaries, type AgentSummary } from '@/hooks/useRecentLogs';
import { usePendingTodoCount } from '@/hooks/usePendingTodoCount';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import DraggableTabs from '@/components/shared/DraggableTabs';
import SessionCard from '@/components/shared/SessionCard';

const AgentTerminalModal = dynamic(() => import('@/components/agents/AgentTerminalModal'), {
	ssr: false,
});

/* ── Helpers ── */
function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDateTime(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function timeAgo(ts: number, t: (key: string, values?: Record<string, number>) => string): string {
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return t('time.justNow');
	if (mins < 60) return t('time.minutesAgo', { mins });
	const hours = Math.floor(mins / 60);
	if (hours < 24) return t('time.hoursAgo', { hours });
	return t('time.daysAgo', { days: Math.floor(hours / 24) });
}

function getGreeting(t: (key: string) => string): string {
	const h = new Date().getHours();
	if (h < 12) return t('greeting.morning');
	if (h < 18) return t('greeting.afternoon');
	return t('greeting.evening');
}

/* ── Live Clock ── */
function LiveClock() {
	const [time, setTime] = useState(new Date());
	useEffect(() => {
		const timer = setInterval(() => setTime(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);
	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
			<AccessTimeRoundedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
			<Typography
				variant="h5"
				sx={{
					fontWeight: 600,
					fontFamily: 'monospace',
					color: 'text.secondary',
					letterSpacing: 1,
				}}
			>
				{time.toLocaleTimeString('fr-FR', {
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
				})}
			</Typography>
		</Box>
	);
}



/* ── Summary Timeline ── */
function SummaryTimeline({
	summaries,
	onSessionClick,
	t,
}: {
	summaries: AgentSummary[];
	onSessionClick: (summary: AgentSummary) => void;
	t: (key: string) => string;
}) {
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const toggleExpand = (id: string) => {
		setExpandedId((prev) => (prev === id ? null : id));
	};

	return (
		<Timeline
			sx={{
				p: 0,
				m: 0,
				'& .MuiTimelineItem-root:before': { display: 'none' },
			}}
		>
			{summaries.map((summary, index) => {
				const isError = summary.status === 'error';
				const dotColor = isError ? '#FF5252' : '#22C55E';
				const isExpanded = expandedId === summary.session_id;
				const isLast = index === summaries.length - 1;

				// Extract label (title or first meaningful line)
				const label = summary.title ?? summary.agent_name ?? 'Claude';

				return (
					<TimelineItem key={summary.session_id}>
						<TimelineOppositeContent
							sx={{
								flex: '0 0 90px',
								px: 1,
								pt: 1.5,
								textAlign: 'right',
							}}
						>
							<Typography
								variant="caption"
								sx={{
									color: 'text.disabled',
									fontSize: '0.65rem',
									fontFamily: 'monospace',
									lineHeight: 1.4,
								}}
							>
								{formatDateTime(
									summary.summary_at ?? summary.ended_at ?? summary.started_at,
								)}
							</Typography>
						</TimelineOppositeContent>

						<TimelineSeparator>
							<TimelineDot
								sx={{
									bgcolor: dotColor,
									boxShadow: `0 0 8px ${alpha(dotColor, 0.4)}`,
									width: 10,
									height: 10,
									p: 0,
									my: 1.5,
								}}
							/>
							{!isLast && (
								<TimelineConnector sx={{ bgcolor: 'divider', width: 1 }} />
							)}
						</TimelineSeparator>

						<TimelineContent sx={{ py: 1, px: 2 }}>
							{/* Branch above label */}
							{summary.branch && (
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
									<AccountTreeRoundedIcon
										sx={{ fontSize: 11, color: 'secondary.main' }}
									/>
									<Typography
										variant="caption"
										sx={{
											color: 'secondary.main',
											fontSize: '0.6rem',
											fontWeight: 600,
											fontFamily: 'monospace',
										}}
									>
										{summary.branch}
									</Typography>
								</Box>
							)}

							{/* Clickable label row */}
							<Box
								onClick={() => toggleExpand(summary.session_id)}
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 0.75,
									cursor: 'pointer',
									borderRadius: 0.5,
									mx: -0.75,
									px: 0.75,
									py: 0.25,
									transition: 'background-color 0.15s',
									'&:hover': {
										bgcolor: (t: { palette: { action: { hover: string } } }) =>
											t.palette.action.hover,
									},
								}}
							>
								{isError ? (
									<ErrorOutlineRoundedIcon
										sx={{ fontSize: 14, color: '#FF5252' }}
									/>
								) : (
									<CheckCircleOutlineRoundedIcon
										sx={{ fontSize: 14, color: '#22C55E' }}
									/>
								)}
								<Typography
									variant="body2"
									sx={{
										fontWeight: 600,
										fontSize: '0.82rem',
										flex: 1,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{label}
								</Typography>
								<ExpandMoreRoundedIcon
									sx={{
										fontSize: 18,
										color: 'text.disabled',
										transition: 'transform 0.2s',
										transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
									}}
								/>
							</Box>

							{/* Expanded content */}
							<Collapse in={isExpanded} timeout={200}>
								<Box sx={{ pt: 1.5, pb: 1 }}>
									{/* Meta */}
									<Box
										sx={{
											display: 'flex',
											alignItems: 'center',
											gap: 1,
											mb: 1.5,
										}}
									>
										<SmartToyRoundedIcon
											sx={{ fontSize: 12, color: 'text.disabled' }}
										/>
										<Typography
											variant="caption"
											sx={{
												color: 'text.disabled',
												fontSize: '0.65rem',
											}}
										>
											{summary.agent_name ?? 'Claude'}
										</Typography>
										<FolderRoundedIcon
											sx={{ fontSize: 11, color: 'text.disabled' }}
										/>
										<Typography
											variant="caption"
											sx={{
												color: 'text.disabled',
												fontSize: '0.65rem',
											}}
										>
											{summary.project_name}
										</Typography>
									</Box>

									{/* Markdown summary */}
									{summary.summary ? (
										<Box
											sx={{
												color: 'text.secondary',
												fontSize: '0.78rem',
												lineHeight: 1.7,
												'& p': { m: 0 },
												'& p + p': { mt: 1 },
												'& h2': {
													fontSize: '0.82rem',
													fontWeight: 700,
													color: 'text.primary',
													mt: 2,
													mb: 0.5,
												},
												'& h3': {
													fontSize: '0.78rem',
													fontWeight: 600,
													color: 'text.primary',
													mt: 1.5,
													mb: 0.5,
												},
												'& ul, & ol': {
													pl: 2.5,
													my: 0.5,
												},
												'& li': {
													fontSize: '0.78rem',
													mb: 0.25,
												},
												'& code': {
													fontFamily: '"JetBrains Mono", monospace',
													fontSize: '0.72em',
													bgcolor: 'rgba(255,255,255,0.06)',
													px: 0.5,
													py: 0.15,
													borderRadius: 0.5,
												},
												'& pre': {
													bgcolor: 'rgba(0,0,0,0.3)',
													p: 1.5,
													borderRadius: 1,
													overflow: 'auto',
													my: 1,
												},
												'& pre code': {
													bgcolor: 'transparent',
													p: 0,
												},
											}}
										>
											<ReactMarkdown remarkPlugins={[remarkGfm]}>
												{summary.summary}
											</ReactMarkdown>
										</Box>
									) : (
										<Typography
											variant="caption"
											sx={{
												color: 'text.disabled',
												fontStyle: 'italic',
											}}
										>
											{isError
												? t('sessionError')
												: t('noReport')}
										</Typography>
									)}

									{/* Open session button */}
									<Typography
										variant="caption"
										onClick={(e) => {
											e.stopPropagation();
											onSessionClick(summary);
										}}
										sx={{
											display: 'inline-block',
											mt: 1.5,
											color: '#7C5CFF',
											fontSize: '0.7rem',
											fontWeight: 600,
											cursor: 'pointer',
											'&:hover': {
												textDecoration: 'underline',
											},
										}}
									>
										{t('viewSession')} →
									</Typography>
								</Box>
							</Collapse>
						</TimelineContent>
					</TimelineItem>
				);
			})}
		</Timeline>
	);
}

/* ── Selected session state ── */
type SelectedItem =
	| { type: 'active'; session: ActiveSession }
	| { type: 'past'; session: AgentSession };

/* ── Main Dashboard ── */
export default function Dashboard() {
	const t = useTranslations('dashboard');
	const queryClient = useQueryClient();
	const { data: sessions = [] } = useActiveSessions();
	const { data: pastSessions = [] } = useAgentSessionHistory();
	const { views, reorderViews } = useAgentViews();
	const { data: summaries = [], isLoading: summariesLoading } = useAgentSummaries();
	const pendingCount = usePendingTodoCount();
	const [tabIndex, setTabIndex] = useState(0);
	const [selected, setSelected] = useState<SelectedItem | null>(null);

	// Exclude active sessions from past list
	const activeSessionIds = useMemo(() => new Set(sessions.map((s) => s.sessionId)), [sessions]);
	const filteredPast = useMemo(
		() => pastSessions.filter((s) => !activeSessionIds.has(s.session_id)),
		[pastSessions, activeSessionIds],
	);

	// Filter by view
	const activeView = views[tabIndex];
	const filteredActiveSessions = useMemo(() => {
		if (!activeView) return sessions;
		return sessions.filter((s) => s.cwd.startsWith(activeView.path));
	}, [sessions, activeView]);

	const filteredPastSessions = useMemo(() => {
		if (!activeView) return filteredPast;
		return filteredPast.filter(
			(s) =>
				s.project_path.startsWith(activeView.path) || s.project_name === activeView.label,
		);
	}, [filteredPast, activeView]);

	const filteredSummaries = useMemo(() => {
		if (!activeView) return summaries;
		return summaries.filter((s) => s.project_path.startsWith(activeView.path));
	}, [summaries, activeView]);


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

	const handleDeleteSession = useCallback(
		async (id: string) => {
			try {
				await supabase.from('agent_activity_logs').delete().eq('agent_session_id', id);
				await supabase.from('agent_sessions').delete().eq('id', id);
				queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
				queryClient.invalidateQueries({ queryKey: ['agent-summaries'] });
			} catch {
				// ignore
			}
		},
		[queryClient],
	);

	// Find matching AgentSession for a summary (to open terminal modal)
	const handleSummaryClick = useCallback(
		(summary: AgentSummary) => {
			const match = pastSessions.find((s) => s.session_id === summary.session_id);
			if (match) {
				setSelected({ type: 'past', session: match });
			}
		},
		[pastSessions],
	);

	const todayStr = new Date().toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});

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
			<Box sx={{ p: 4, maxWidth: 1400, mx: 'auto' }}>
				{/* ── Header: Greeting + Clock ── */}
				<Box
					sx={{
						display: 'flex',
						alignItems: 'flex-end',
						justifyContent: 'space-between',
						mb: 3,
					}}
				>
					<Box>
						<Typography
							variant="h4"
							sx={{
								fontWeight: 700,
								background: 'linear-gradient(135deg, #7C5CFF 0%, #00E5FF 100%)',
								WebkitBackgroundClip: 'text',
								WebkitTextFillColor: 'transparent',
							}}
						>
							{getGreeting(t)}
						</Typography>
						<Typography
							variant="body2"
							sx={{ color: 'text.disabled', mt: 0.5, textTransform: 'capitalize' }}
						>
							{todayStr}
						</Typography>
					</Box>
					<LiveClock />
				</Box>

				{/* ── Quick stats bar ── */}
				<Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1,
							px: 2,
							py: 1,
							borderRadius: 1,
							bgcolor: alpha('#7C5CFF', 0.08),
							border: 1,
							borderColor: alpha('#7C5CFF', 0.15),
						}}
					>
						<SmartToyRoundedIcon sx={{ fontSize: 18, color: '#7C5CFF' }} />
						<Typography variant="body2" sx={{ fontWeight: 600, color: '#7C5CFF' }}>
							{sessions.length}
						</Typography>
						<Typography variant="caption" sx={{ color: 'text.secondary' }}>
							{t('activeAgents', { count: sessions.length })}
						</Typography>
					</Box>
					{sessions.filter((s) => s.isStreaming).length > 0 && (
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 1,
								px: 2,
								py: 1,
								borderRadius: 1,
								bgcolor: alpha('#4CAF50', 0.08),
								border: 1,
								borderColor: alpha('#4CAF50', 0.15),
							}}
						>
							<FiberManualRecordRoundedIcon
								sx={{
									fontSize: 10,
									color: '#4CAF50',
									animation: 'pulse 2s ease-in-out infinite',
									'@keyframes pulse': {
										'0%, 100%': { opacity: 0.4 },
										'50%': { opacity: 1 },
									},
								}}
							/>
							<Typography variant="body2" sx={{ fontWeight: 600, color: '#4CAF50' }}>
								{sessions.filter((s) => s.isStreaming).length}
							</Typography>
							<Typography variant="caption" sx={{ color: 'text.secondary' }}>
								{t('streaming')}
							</Typography>
						</Box>
					)}
					{pendingCount > 0 && (
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 1,
								px: 2,
								py: 1,
								borderRadius: 1,
								bgcolor: alpha('#FF9800', 0.08),
								border: 1,
								borderColor: alpha('#FF9800', 0.15),
							}}
						>
							<AssignmentRoundedIcon sx={{ fontSize: 18, color: '#FF9800' }} />
							<Typography variant="body2" sx={{ fontWeight: 600, color: '#FF9800' }}>
								{pendingCount}
							</Typography>
							<Typography variant="caption" sx={{ color: 'text.secondary' }}>
								{t('pendingTodos', { count: pendingCount })}
							</Typography>
						</Box>
					)}
				</Box>

				{/* ── View tabs ── */}
				{views.length > 0 && (
					<Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
						<DraggableTabs
							tabs={views.map((v) => v.label)}
							activeTab={tabIndex}
							onTabChange={setTabIndex}
							onReorder={reorderViews}
							counts={views.map(
								(v) => sessions.filter((s) => s.cwd.startsWith(v.path)).length,
							)}
							mb={0}
						/>
					</Box>
				)}

				{/* ── Main content: Agents (left) + Summaries (right) ── */}
				<Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
					{/* Left: Agents panel */}
					<Box
						sx={{ flex: '0 0 380px', display: 'flex', flexDirection: 'column', gap: 2 }}
					>
							{/* Active sessions */}
						{filteredActiveSessions.length > 0 && (
							<Box>
								<Box
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1,
										mb: 1.5,
									}}
								>
									<SmartToyRoundedIcon sx={{ fontSize: 16, color: '#7C5CFF' }} />
									<Typography
										variant="caption"
										sx={{
											color: 'text.disabled',
											fontWeight: 700,
											fontSize: '0.68rem',
											letterSpacing: 0.5,
											textTransform: 'uppercase',
										}}
									>
										{t('activeAgentsTitle')}
									</Typography>
									<Box
										sx={{
											ml: 'auto',
											bgcolor: alpha('#4CAF50', 0.15),
											color: '#4CAF50',
											fontSize: '0.65rem',
											fontWeight: 700,
											px: 0.75,
											py: 0.15,
											borderRadius: 1,
										}}
									>
										{filteredActiveSessions.length}
									</Box>
								</Box>
								<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
									{filteredActiveSessions.map((session) => (
										<SessionCard
											key={session.sessionId}
											name={session.agentName ?? 'Claude'}
											subtitle={session.projectName}
											branch={session.branch ?? undefined}
											status="active"
											isStreaming={session.isStreaming}
											date={timeAgo(session.createdAt, t)}
											onClick={() => setSelected({ type: 'active', session })}
											onStop={() => handleKillSession(session.sessionId)}
										/>
									))}
								</Box>
							</Box>
						)}

						{/* Past sessions */}
						{filteredPastSessions.length > 0 && (
							<Box>
								<Box
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1,
										mb: 1.5,
									}}
								>
									<HistoryRoundedIcon
										sx={{ fontSize: 14, color: 'text.disabled' }}
									/>
									<Typography
										variant="caption"
										sx={{
											color: 'text.disabled',
											fontWeight: 600,
											fontSize: '0.65rem',
											letterSpacing: 0.5,
											textTransform: 'uppercase',
										}}
									>
										{t('pastSessions')}
									</Typography>
								</Box>
								<Box
									sx={{
										display: 'flex',
										flexDirection: 'column',
										gap: 0.75,
										maxHeight: 400,
										overflowY: 'auto',
										'&::-webkit-scrollbar': { width: 3 },
										'&::-webkit-scrollbar-thumb': {
											bgcolor: 'divider',
											borderRadius: 1,
										},
									}}
								>
									{filteredPastSessions.slice(0, 15).map((session) => (
										<SessionCard
											key={session.id}
											name={session.agent_name ?? 'Claude'}
											branch={session.branch ?? undefined}
											status={session.status === 'error' ? 'error' : 'completed'}
											date={formatDate(session.started_at)}
											onClick={() => setSelected({ type: 'past', session })}
											onDelete={() => handleDeleteSession(session.id)}
											compact
										/>
									))}
								</Box>
							</Box>
						)}

						{/* Empty state */}
						{filteredActiveSessions.length === 0 &&
							filteredPastSessions.length === 0 && (
								<Box
									sx={{
										bgcolor: 'background.paper',
										borderRadius: 1,
										border: 1,
										borderColor: 'divider',
										p: 4,
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center',
										gap: 1.5,
									}}
								>
									<SmartToyRoundedIcon
										sx={{ fontSize: 40, color: 'text.disabled' }}
									/>
									<Typography
										variant="body2"
										sx={{ color: 'text.disabled', textAlign: 'center' }}
									>
										{t('noSessionsProject')}
									</Typography>
									<Typography
										variant="caption"
										sx={{ color: 'text.disabled', textAlign: 'center' }}
									>
										{t('launchAgentToStart')}
									</Typography>
								</Box>
							)}
					</Box>

					{/* Right: Summaries panel */}
					<Box
						sx={{
							flex: '1 1 0',
							display: 'flex',
							flexDirection: 'column',
							minHeight: 400,
						}}
					>
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 0.75,
								px: 2,
								py: 1,
								mb: 2,
								borderBottom: 2,
								borderColor: '#7C5CFF',
							}}
						>
							<SummarizeRoundedIcon sx={{ fontSize: 18 }} />
							<Typography
								variant="body2"
								sx={{ fontWeight: 600, fontSize: '0.82rem' }}
							>
								{t('reports')}
							</Typography>
							<Chip
								label={filteredSummaries.length}
								size="small"
								sx={{
									height: 18,
									fontSize: '0.6rem',
									fontWeight: 700,
									bgcolor: alpha('#7C5CFF', 0.12),
									color: '#7C5CFF',
								}}
							/>
						</Box>

						<Box
							sx={{
								flex: 1,
								overflowY: 'auto',
								maxHeight: 'calc(100vh - 370px)',
								'&::-webkit-scrollbar': { width: 4 },
								'&::-webkit-scrollbar-thumb': {
									bgcolor: 'divider',
									borderRadius: 1,
								},
							}}
						>
							{summariesLoading ? (
								<Box
									sx={{
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										py: 8,
									}}
								>
									<CircularProgress
										size={24}
										sx={{ color: '#7C5CFF' }}
									/>
								</Box>
							) : filteredSummaries.length === 0 ? (
								<Box
									sx={{
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center',
										justifyContent: 'center',
										py: 8,
										gap: 1,
									}}
								>
									<SummarizeRoundedIcon
										sx={{ fontSize: 40, color: 'text.disabled' }}
									/>
									<Typography
										variant="body2"
										sx={{ color: 'text.disabled' }}
									>
										{t('noReportsYet')}
									</Typography>
									<Typography
										variant="caption"
										sx={{ color: 'text.disabled' }}
									>
										{t('reportsAppearWhen')}
									</Typography>
								</Box>
							) : (
								<SummaryTimeline
									summaries={filteredSummaries}
									onSessionClick={handleSummaryClick}
									t={t}
								/>
							)}
						</Box>
					</Box>
				</Box>
			</Box>

			{/* Terminal modals */}
			<AgentTerminalModal
				open={modalOpen}
				onClose={() => setSelected(null)}
				{...modalProps}
			/>
		</>
	);
}
