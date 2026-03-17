'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { type AgentSession } from '@/hooks/useAgentSession';
import DashboardWidget from './DashboardWidget';

interface RecentSessionsWidgetProps {
	sessions: AgentSession[];
	onSessionClick: (session: AgentSession) => void;
	onDeleteSession: (id: string) => Promise<void>;
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
	onDeleteSession,
}: RecentSessionsWidgetProps) {
	const theme = useTheme();
	const t = useTranslations('dashboard');
	const tCard = useTranslations('sessionCard');
	const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; session: AgentSession } | null>(null);

	return (
		<DashboardWidget
			title={t('recentSessions')}
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
									'&:hover .session-actions': {
										opacity: 1,
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
										{session.branch ?? session.agent_name ?? 'Claude'}
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
										{session.agent_name ?? 'Claude'}
										{' · '}
										{session.project_name}
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
								<IconButton
									className="session-actions"
									size="small"
									onClick={(e) => {
										e.stopPropagation();
										setMenuAnchor({ el: e.currentTarget, session });
									}}
									sx={{
										p: 0.25,
										opacity: 0,
										transition: 'opacity 0.15s',
										color: 'text.disabled',
										'&:hover': { color: 'text.secondary' },
									}}
								>
									<MoreVertRoundedIcon sx={{ fontSize: 16 }} />
								</IconButton>
							</Box>
						);
					})}
				</Box>
			)}

			{/* Actions menu */}
			<Menu
				anchorEl={menuAnchor?.el}
				open={!!menuAnchor}
				onClose={(e: React.SyntheticEvent) => {
					e.stopPropagation?.();
					setMenuAnchor(null);
				}}
				onClick={(e) => e.stopPropagation()}
				slotProps={{
					paper: {
						sx: {
							bgcolor: 'background.paper',
							border: 1,
							borderColor: 'divider',
							minWidth: 160,
						},
					},
				}}
			>
				<MenuItem
					onClick={(e) => {
						e.stopPropagation();
						if (menuAnchor) {
							onDeleteSession(menuAnchor.session.id);
						}
						setMenuAnchor(null);
					}}
					sx={{ fontSize: '0.8rem', gap: 1 }}
				>
					<ListItemIcon sx={{ minWidth: '28px !important' }}>
						<DeleteOutlineRoundedIcon sx={{ fontSize: 18, color: 'error.main' }} />
					</ListItemIcon>
					<ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
						{tCard('delete')}
					</ListItemText>
				</MenuItem>
			</Menu>
		</DashboardWidget>
	);
}
