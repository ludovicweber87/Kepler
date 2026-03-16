'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { useTranslations } from 'next-intl';
import { type ActiveSession } from '@/hooks/useActiveSessions';
import DashboardWidget from './DashboardWidget';

interface ActiveAgentsWidgetProps {
	sessions: ActiveSession[];
	pendingQuestions: Set<string>;
	onSessionClick: (session: ActiveSession) => void;
	onStopSession: (sessionId: string) => void;
}

function timeAgoShort(ts: number): string {
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return '<1m';
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	return `${hours}h${mins % 60 > 0 ? `${mins % 60}m` : ''}`;
}

export default function ActiveAgentsWidget({
	sessions,
	pendingQuestions,
	onSessionClick,
	onStopSession,
}: ActiveAgentsWidgetProps) {
	const theme = useTheme();
	const t = useTranslations('dashboard');

	return (
		<DashboardWidget
			title={t('activeAgentsTitle')}
			badge={sessions.length > 0 ? t('running', { count: sessions.length }) : undefined}
		>
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
					<SmartToyRoundedIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
					<Typography variant="caption" sx={{ color: 'text.disabled' }}>
						{t('noActiveAgents')}
					</Typography>
				</Box>
			) : (
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					{sessions.map((session) => {
						const hasQuestion = pendingQuestions.has(session.cwd);
						const dotColor = hasQuestion
							? theme.palette.warning.main
							: theme.palette.success.main;

						return (
							<Box
								key={session.sessionId}
								onClick={() => onSessionClick(session)}
								sx={{
									bgcolor: 'background.default',
									borderRadius: '8px',
									border: 1,
									borderColor: 'divider',
									p: 1.25,
									display: 'flex',
									alignItems: 'center',
									gap: 1.25,
									cursor: 'pointer',
									transition: 'all 0.15s',
									'&:hover': {
										borderColor: alpha(theme.palette.primary.main, 0.3),
										bgcolor: alpha(theme.palette.primary.main, 0.04),
									},
								}}
							>
								<Box
									sx={{
										width: 8,
										height: 8,
										borderRadius: '50%',
										bgcolor: dotColor,
										flexShrink: 0,
										animation: 'pulse 1.5s ease-in-out infinite',
										'@keyframes pulse': {
											'0%, 100%': { opacity: 1 },
											'50%': { opacity: 0.4 },
										},
									}}
								/>
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
										{session.agentName ?? 'Claude'}
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
										{session.projectName}
										{' · '}
										{hasQuestion
											? t('questionPending')
											: `${t('streamingSince')} ${timeAgoShort(session.createdAt)}`}
									</Typography>
								</Box>
								{session.branch && (
									<Chip
										label={session.branch}
										size="small"
										sx={{
											height: 20,
											fontSize: '0.6rem',
											fontWeight: 500,
											fontFamily: 'monospace',
											bgcolor: alpha(theme.palette.primary.main, 0.1),
											color: alpha(theme.palette.primary.main, 0.8),
											maxWidth: 140,
										}}
									/>
								)}
								<Button
									size="small"
									onClick={(e) => {
										e.stopPropagation();
										onStopSession(session.sessionId);
									}}
									sx={{
										minWidth: 0,
										p: 0.5,
										color: 'error.main',
										fontSize: '0.65rem',
										'&:hover': {
											bgcolor: alpha(theme.palette.error.main, 0.1),
										},
									}}
								>
									<StopRoundedIcon sx={{ fontSize: 16 }} />
								</Button>
							</Box>
						);
					})}
				</Box>
			)}
		</DashboardWidget>
	);
}
