'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { alpha } from '@mui/material/styles';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useActiveSessions, type ActiveSession } from '@/hooks/useActiveSessions';
import { useAgentSessionHistory, type AgentSession } from '@/hooks/useAgentSession';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useRightSidebar } from '@/hooks/useRightSidebar';
import DraggableTabs from '@/components/shared/DraggableTabs';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

export const RIGHT_SIDEBAR_WIDTH = 400;
const MIN_WIDTH = 400;
const MAX_WIDTH = 400;

function timeAgo(ts: number): string {
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "à l'instant";
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/* ── Active session card (live tmux) ── */
function ActiveSessionCard({
	session,
	onClick,
	isStreaming,
	onKill,
}: {
	session: ActiveSession;
	onClick: () => void;
	isStreaming: boolean;
	onKill: () => void;
}) {
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

	return (
		<Box
			onClick={onClick}
			sx={{
				p: 1.5,
				borderRadius: 1,
				bgcolor: alpha('#22C55E', isStreaming ? 0.08 : 0.04),
				border: 1,
				borderColor: alpha('#22C55E', isStreaming ? 0.25 : 0.1),
				borderLeft: isStreaming ? 3 : 1,
				borderLeftColor: isStreaming ? '#22C55E' : alpha('#22C55E', 0.1),
				cursor: 'pointer',
				transition: 'all 0.15s',
				'&:hover': {
					bgcolor: alpha('#22C55E', 0.12),
					borderColor: alpha('#22C55E', 0.3),
					transform: 'translateX(-2px)',
				},
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
				<FiberManualRecordRoundedIcon
					sx={{ fontSize: 8, color: isStreaming ? '#4CAF50' : '#9E9E9E' }}
				/>
				<Typography
					variant="body2"
					sx={{
						fontWeight: 600,
						fontSize: '0.8rem',
						flex: 1,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{session.agentName ?? 'Claude'}
				</Typography>
				{/* Streaming dots — only when Claude is actively outputting */}
				{isStreaming && (
					<Box sx={{ display: 'flex', gap: 0.4, alignItems: 'center' }}>
						{[0, 1, 2].map((i) => (
							<Box
								key={i}
								sx={{
									width: 4,
									height: 4,
									borderRadius: '50%',
									bgcolor: '#7C5CFF',
									animation: 'dotPulse 1.4s ease-in-out infinite',
									animationDelay: `${i * 0.2}s`,
									'@keyframes dotPulse': {
										'0%, 80%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
										'40%': { opacity: 1, transform: 'scale(1)' },
									},
								}}
							/>
						))}
					</Box>
				)}
				<IconButton
					size="small"
					onClick={(e) => {
						e.stopPropagation();
						setAnchorEl(e.currentTarget);
					}}
					sx={{
						p: 0.25,
						color: 'text.disabled',
						'&:hover': { color: 'text.secondary' },
					}}
				>
					<MoreVertRoundedIcon sx={{ fontSize: 16 }} />
				</IconButton>
				<Menu
					anchorEl={anchorEl}
					open={Boolean(anchorEl)}
					onClose={(e: React.SyntheticEvent) => {
						e.stopPropagation?.();
						setAnchorEl(null);
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
							setAnchorEl(null);
							onKill();
						}}
						sx={{ fontSize: '0.8rem', gap: 1 }}
					>
						<ListItemIcon sx={{ minWidth: '28px !important' }}>
							<StopCircleRoundedIcon sx={{ fontSize: 18, color: '#FF5252' }} />
						</ListItemIcon>
						<ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
							Arrêter la session
						</ListItemText>
					</MenuItem>
				</Menu>
			</Box>

			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
				<FolderRoundedIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
				<Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
					{session.projectName}
				</Typography>
			</Box>

			{session.branch && (
				<Chip
					icon={<AccountTreeRoundedIcon sx={{ fontSize: '12px !important' }} />}
					label={session.branch}
					size="small"
					sx={{
						height: 20,
						fontSize: '0.65rem',
						bgcolor: (t: { palette: { secondary: { main: string } } }) =>
							alpha(t.palette.secondary.main, 0.1),
						color: 'secondary.main',
						border: 1,
						borderColor: (t: { palette: { secondary: { main: string } } }) =>
							alpha(t.palette.secondary.main, 0.2),
						'& .MuiChip-icon': { color: 'secondary.main' },
					}}
				/>
			)}
		</Box>
	);
}

/* ── Past session card (from DB) ── */
function PastSessionCard({
	session,
	onClick,
	onDelete,
}: {
	session: AgentSession;
	onClick: () => void;
	onDelete: () => void;
}) {
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const isError = session.status === 'error';
	const statusColor = isError ? '#FF5252' : '#9E9E9E';
	const StatusIcon = isError ? ErrorOutlineRoundedIcon : CheckCircleOutlineRoundedIcon;

	return (
		<Box
			onClick={onClick}
			sx={{
				p: 1.5,
				borderRadius: 1,
				bgcolor: alpha('#FF9800', 0.03),
				border: 1,
				borderColor: alpha('#FF9800', 0.08),
				cursor: 'pointer',
				transition: 'all 0.15s',
				'&:hover': {
					bgcolor: alpha('#FF9800', 0.07),
					borderColor: alpha('#FF9800', 0.15),
				},
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
				<StatusIcon sx={{ fontSize: 14, color: statusColor }} />
				<Typography
					variant="body2"
					sx={{
						fontWeight: 600,
						fontSize: '0.75rem',
						flex: 1,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						color: 'text.secondary',
					}}
				>
					{session.agent_name ?? 'Claude'}
				</Typography>
				<Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>
					{formatDate(session.started_at)}
				</Typography>
				<IconButton
					size="small"
					onClick={(e) => {
						e.stopPropagation();
						setAnchorEl(e.currentTarget);
					}}
					sx={{
						p: 0.25,
						color: 'text.disabled',
						'&:hover': { color: 'text.secondary' },
					}}
				>
					<MoreVertRoundedIcon sx={{ fontSize: 14 }} />
				</IconButton>
				<Menu
					anchorEl={anchorEl}
					open={Boolean(anchorEl)}
					onClose={(e: React.SyntheticEvent) => {
						e.stopPropagation?.();
						setAnchorEl(null);
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
							setAnchorEl(null);
							onDelete();
						}}
						sx={{ fontSize: '0.8rem', gap: 1 }}
					>
						<ListItemIcon sx={{ minWidth: '28px !important' }}>
							<DeleteOutlineRoundedIcon sx={{ fontSize: 18, color: '#FF5252' }} />
						</ListItemIcon>
						<ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
							Supprimer
						</ListItemText>
					</MenuItem>
				</Menu>
			</Box>

			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				<FolderRoundedIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
				<Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
					{session.project_name}
				</Typography>
			</Box>

			{session.branch && (
				<Chip
					icon={<AccountTreeRoundedIcon sx={{ fontSize: '11px !important' }} />}
					label={session.branch}
					size="small"
					sx={{
						mt: 0.5,
						height: 18,
						fontSize: '0.6rem',
						bgcolor: (t: { palette: { secondary: { main: string } } }) =>
							alpha(t.palette.secondary.main, 0.06),
						color: 'secondary.main',
						'& .MuiChip-icon': { color: 'secondary.main' },
					}}
				/>
			)}
		</Box>
	);
}

/* ── Selected session state ── */
type SelectedItem =
	| { type: 'active'; session: ActiveSession }
	| { type: 'past'; session: AgentSession };

export default function RightSidebar() {
	const { open, width, setWidth } = useRightSidebar();
	const { data: sessions = [] } = useActiveSessions();
	const { data: pastSessions = [] } = useAgentSessionHistory();
	const { views, reorderViews } = useAgentViews();
	const queryClient = useQueryClient();
	const [selected, setSelected] = useState<SelectedItem | null>(null);
	const [tabIndex, setTabIndex] = useState(0);
	const [isResizing, setIsResizing] = useState(false);
	const startXRef = useRef(0);
	const startWidthRef = useRef(width);

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
			} catch {
				// ignore
			}
		},
		[queryClient],
	);

	// Exclude currently active sessions from past list
	const activeSessionIds = useMemo(() => new Set(sessions.map((s) => s.sessionId)), [sessions]);
	const filteredPast = useMemo(
		() => pastSessions.filter((s) => !activeSessionIds.has(s.session_id)),
		[pastSessions, activeSessionIds],
	);

	const filteredActiveSessions = useMemo(() => {
		const view = views[tabIndex];
		if (!view) return sessions;
		return sessions.filter((s) => s.cwd.startsWith(view.path));
	}, [sessions, views, tabIndex]);

	const filteredPastSessions = useMemo(() => {
		const view = views[tabIndex];
		if (!view) return filteredPast;
		return filteredPast.filter(
			(s) => s.project_path.startsWith(view.path) || s.project_name === view.label,
		);
	}, [filteredPast, views, tabIndex]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsResizing(true);
			startXRef.current = e.clientX;
			startWidthRef.current = width;

			const handleMouseMove = (ev: MouseEvent) => {
				const delta = startXRef.current - ev.clientX;
				const newWidth = Math.min(
					MAX_WIDTH,
					Math.max(MIN_WIDTH, startWidthRef.current + delta),
				);
				setWidth(newWidth);
			};

			const handleMouseUp = () => {
				setIsResizing(false);
				document.removeEventListener('mousemove', handleMouseMove);
				document.removeEventListener('mouseup', handleMouseUp);
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
			};

			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
		},
		[width, setWidth],
	);

	// Build modal props from selected item
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
			<Drawer
				variant="persistent"
				anchor="right"
				open={open}
				sx={{
					width: open ? width : 0,
					flexShrink: 0,
					transition: isResizing ? 'none' : 'width 0.2s',
					'& .MuiDrawer-paper': {
						width,
						boxSizing: 'border-box',
						borderLeft: 1,
						borderColor: 'divider',
						mt: '64px',
						height: 'calc(100vh - 64px)',
						transition: isResizing ? 'none' : 'width 0.2s',
						overflow: 'visible',
						display: 'flex',
						flexDirection: 'column',
					},
				}}
			>
				{/* Resize handle */}
				<Box
					onMouseDown={handleMouseDown}
					sx={{
						position: 'absolute',
						top: 0,
						left: -3,
						bottom: 0,
						width: 6,
						cursor: 'col-resize',
						zIndex: 1300,
						'&::after': {
							content: '""',
							position: 'absolute',
							top: 0,
							left: 2,
							bottom: 0,
							width: 2,
							transition: 'background-color 0.15s',
						},
						'&:hover::after, &:active::after': {
							bgcolor: '#7C5CFF',
						},
					}}
				/>

				{/* Header */}
				<Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<SmartToyRoundedIcon sx={{ color: '#7C5CFF', fontSize: '1.1rem' }} />
						<Typography
							variant="subtitle2"
							sx={{ fontWeight: 700, letterSpacing: 0.5 }}
						>
							Agents
						</Typography>
						{sessions.length > 0 && (
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
								{sessions.length}
							</Box>
						)}
					</Box>
				</Box>

				{/* View tabs */}
				{views.length > 0 && (
					<Box sx={{ px: 1, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
						<DraggableTabs
							tabs={views.map((v) => v.label)}
							activeTab={tabIndex}
							onTabChange={setTabIndex}
							onReorder={(newOrder) => {
								reorderViews(newOrder);
							}}
							counts={views.map(
								(v) => sessions.filter((s) => s.cwd.startsWith(v.path)).length,
							)}
						/>
					</Box>
				)}

				{/* Content */}
				<Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
					{/* Active sessions */}
					{filteredActiveSessions.length > 0 && (
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
							{filteredActiveSessions.map((session) => (
								<ActiveSessionCard
									key={session.sessionId}
									session={session}
									isStreaming={session.isStreaming}
									onClick={() => setSelected({ type: 'active', session })}
									onKill={() => handleKillSession(session.sessionId)}
								/>
							))}
						</Box>
					)}

					{/* Past sessions */}
					{filteredPastSessions.length > 0 && (
						<>
							<Box
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 1,
									mb: 1.5,
									mt: filteredActiveSessions.length > 0 ? 0 : 0,
								}}
							>
								<HistoryRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
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
									Sessions passées
								</Typography>
							</Box>
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
								{filteredPastSessions.map((session) => (
									<PastSessionCard
										key={session.id}
										session={session}
										onClick={() => setSelected({ type: 'past', session })}
										onDelete={() => handleDeleteSession(session.id)}
									/>
								))}
							</Box>
						</>
					)}

					{/* Empty state */}
					{filteredActiveSessions.length === 0 && filteredPastSessions.length === 0 && (
						<Box
							sx={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								py: 6,
								gap: 1,
							}}
						>
							<SmartToyRoundedIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
							<Typography
								variant="caption"
								sx={{ color: 'text.disabled', textAlign: 'center' }}
							>
								Aucune session sur ce projet
							</Typography>
						</Box>
					)}
				</Box>
			</Drawer>

			<AgentTerminalModal
				open={modalOpen}
				onClose={() => setSelected(null)}
				{...modalProps}
			/>
		</>
	);
}
