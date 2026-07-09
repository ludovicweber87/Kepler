'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { type AgentSession } from '@/hooks/useAgentSession';
import DashboardWidget from './DashboardWidget';

interface RecentSessionsWidgetProps {
	sessions: AgentSession[];
	onSessionClick: (session: AgentSession) => void;
}

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return '<1m';
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

function sessionDuration(session: AgentSession): string {
	if (!session.ended_at) return '';
	const start = new Date(session.started_at).getTime();
	const end = new Date(session.ended_at).getTime();
	const mins = Math.floor((end - start) / 60_000);
	if (mins < 1) return '<1m';
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	return `${hours}h${mins % 60}m`;
}

export default function RecentSessionsWidget({
	sessions,
	onSessionClick,
}: RecentSessionsWidgetProps) {
	const theme = useTheme();
	const t = useTranslations('dashboard');

	return (
		<DashboardWidget title={t('recentSessions')}>
			{sessions.length === 0 ? (
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						py: 3,
						gap: 1,
					}}
				>
					<HistoryRoundedIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
					<Typography variant="caption" sx={{ color: 'text.disabled' }}>
						{t('noSessions')}
					</Typography>
				</Box>
			) : (
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						flex: 1,
						overflowY: 'auto',
						'&::-webkit-scrollbar': { width: 3 },
						'&::-webkit-scrollbar-thumb': {
							bgcolor: 'divider',
							borderRadius: 1,
						},
					}}
				>
					{sessions.map((session, index) => {
						const isError = session.status === 'error';
						const duration = sessionDuration(session);

						return (
							<Box
								key={session.id}
								onClick={() => onSessionClick(session)}
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 1.25,
									py: 1,
									borderBottom: index < sessions.length - 1 ? 1 : 0,
									borderColor: 'divider',
									cursor: 'pointer',
									borderRadius: '4px',
									mx: -0.5,
									px: 0.5,
									transition: 'background-color 0.15s',
									'&:hover': {
										bgcolor: alpha(theme.palette.action.hover, 0.5),
									},
								}}
							>
								<Box
									sx={{
										width: 22,
										height: 22,
										borderRadius: '50%',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										bgcolor: isError
											? alpha(theme.palette.error.main, 0.12)
											: alpha(theme.palette.success.main, 0.12),
										flexShrink: 0,
									}}
								>
									{isError ? (
										<ErrorOutlineRoundedIcon
											sx={{ fontSize: 13, color: 'error.main' }}
										/>
									) : (
										<CheckCircleOutlineRoundedIcon
											sx={{ fontSize: 13, color: 'success.main' }}
										/>
									)}
								</Box>
								<Box sx={{ flex: 1, minWidth: 0 }}>
									<Typography
										sx={{
											fontSize: '0.78rem',
											fontWeight: 500,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}
									>
										{session.agent_name ?? session.branch ?? 'Claude'}
									</Typography>
									<Typography
										sx={{
											fontSize: '0.65rem',
											color: 'text.disabled',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}
									>
										{session.branch ?? session.project_name}
										{session.branch ? ` · ${session.project_name}` : ''}
										{duration && ` · ${duration}`}
									</Typography>
								</Box>
								<Typography
									sx={{
										fontSize: '0.65rem',
										color: 'text.disabled',
										flexShrink: 0,
									}}
								>
									{timeAgo(session.started_at)}
								</Typography>
							</Box>
						);
					})}
				</Box>
			)}
		</DashboardWidget>
	);
}
