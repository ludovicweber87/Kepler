'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useRightSidebar } from '@/hooks/useRightSidebar';
import { useWorktrees, type WorktreeInfo } from '@/hooks/useWorktrees';
import { useSessionManager, type ActiveSession, type AgentSession } from '@/hooks/useSessionManager';
import DraggableTabs from '@/components/shared/DraggableTabs';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

export const RIGHT_SIDEBAR_WIDTH = 400;
const MIN_WIDTH = 400;
const MAX_WIDTH = 400;

/* ── Worktree card for sidebar ── */
function SidebarWorktreeCard({
	worktree,
	onClick,
	onStop,
	activeSession,
	pastSession,
}: {
	worktree: WorktreeInfo;
	onClick: () => void;
	onStop?: () => void;
	activeSession: ActiveSession | null;
	pastSession: AgentSession | null;
}) {
	const isActive = !!activeSession;
	const isFinished = !isActive && !!pastSession;
	const isError = pastSession?.status === 'error';
	const isStreaming = activeSession?.isStreaming ?? false;

	const borderColor = isActive
		? alpha('#22C55E', isStreaming ? 0.25 : 0.1)
		: isFinished
			? alpha(isError ? '#EF4444' : '#9E9E9E', 0.15)
			: 'divider';

	const bgColor = isActive
		? alpha('#22C55E', isStreaming ? 0.08 : 0.04)
		: isFinished
			? alpha(isError ? '#EF4444' : '#9E9E9E', 0.04)
			: 'background.paper';

	return (
		<Box
			onClick={onClick}
			sx={{
				p: 1.5,
				borderRadius: 1,
				bgcolor: bgColor,
				border: 1,
				borderColor,
				borderLeft: isActive && isStreaming ? 3 : 1,
				borderLeftColor: isActive && isStreaming ? '#22C55E' : borderColor,
				cursor: 'pointer',
				transition: 'all 0.15s',
				opacity: isFinished ? 0.6 : 1,
				'&:hover': {
					bgcolor: isActive
						? alpha('#22C55E', 0.12)
						: isFinished
							? alpha(isError ? '#EF4444' : '#9E9E9E', 0.08)
							: 'action.hover',
					borderColor: isActive
						? alpha('#22C55E', 0.3)
						: isFinished
							? alpha(isError ? '#EF4444' : '#9E9E9E', 0.25)
							: 'action.disabled',
					transform: 'translateX(-2px)',
					opacity: isFinished ? 0.8 : 1,
				},
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
				{/* Status indicator */}
				{isActive ? (
					<FiberManualRecordRoundedIcon
						sx={{ fontSize: 8, color: isStreaming ? '#4CAF50' : '#9E9E9E' }}
					/>
				) : isFinished ? (
					isError ? (
						<ErrorOutlineRoundedIcon sx={{ fontSize: 14, color: '#EF4444' }} />
					) : (
						<CheckCircleOutlineRoundedIcon sx={{ fontSize: 14, color: '#9E9E9E' }} />
					)
				) : (
					<AccountTreeRoundedIcon sx={{ fontSize: 14, color: '#7C5CFF' }} />
				)}

				{/* Branch name */}
				<Typography
					variant="body2"
					sx={{
						fontWeight: 600,
						fontSize: '0.75rem',
						flex: 1,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						color: isFinished ? 'text.secondary' : 'text.primary',
					}}
				>
					{worktree.branch}
				</Typography>

				{/* Streaming dots */}
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

				{/* Status chips */}
				{isActive && (
					<Chip
						label="Active"
						size="small"
						sx={{
							height: 18,
							fontSize: '0.6rem',
							fontWeight: 600,
							bgcolor: alpha('#22C55E', 0.12),
							color: '#22C55E',
							border: `1px solid ${alpha('#22C55E', 0.2)}`,
						}}
					/>
				)}
				{isFinished && !isError && (
					<Chip
						label="Terminé"
						size="small"
						sx={{
							height: 18,
							fontSize: '0.6rem',
							fontWeight: 600,
							bgcolor: alpha('#9E9E9E', 0.12),
							color: '#9E9E9E',
							border: `1px solid ${alpha('#9E9E9E', 0.2)}`,
						}}
					/>
				)}
				{isFinished && isError && (
					<Chip
						label="Erreur"
						size="small"
						sx={{
							height: 18,
							fontSize: '0.6rem',
							fontWeight: 600,
							bgcolor: alpha('#EF4444', 0.12),
							color: '#EF4444',
							border: `1px solid ${alpha('#EF4444', 0.2)}`,
						}}
					/>
				)}

				{/* Stop button */}
				{isActive && onStop && (
					<IconButton
						size="small"
						onClick={(e) => {
							e.stopPropagation();
							onStop();
						}}
						sx={{
							p: 0.25,
							color: '#EF4444',
							'&:hover': { bgcolor: alpha('#EF4444', 0.1) },
						}}
					>
						<StopCircleRoundedIcon sx={{ fontSize: 16 }} />
					</IconButton>
				)}
			</Box>

			{/* Path */}
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				<FolderRoundedIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
				<Typography
					variant="caption"
					sx={{
						color: 'text.disabled',
						fontSize: '0.6rem',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{worktree.path.split('/').slice(-2).join('/')}
				</Typography>
			</Box>
		</Box>
	);
}

export default function RightSidebar() {
	const { open, width, setWidth } = useRightSidebar();
	const { views, reorderViews } = useAgentViews();
	const { activeSessions, killSession, getActiveForPath, getPastForPath } = useSessionManager();
	const [tabIndex, setTabIndex] = useState(0);
	const [isResizing, setIsResizing] = useState(false);
	const startXRef = useRef(0);
	const startWidthRef = useRef(width);

	// Selected worktree for modal
	const [selected, setSelected] = useState<{
		worktree: WorktreeInfo;
		existingSessionId?: string;
		isPastSession?: boolean;
	} | null>(null);

	// Current view
	const activeView = views[tabIndex] ?? null;
	const { worktrees } = useWorktrees(activeView?.path);

	// Count active tmux sessions per view for tab badges
	const viewCounts = useMemo(
		() => views.map((v) => activeSessions.filter((s) => s.cwd.startsWith(v.path)).length),
		[views, activeSessions],
	);

	const handleWorktreeClick = useCallback(
		(wt: WorktreeInfo) => {
			const active = getActiveForPath(wt.path);
			if (active) {
				setSelected({ worktree: wt, existingSessionId: active.sessionId });
				return;
			}

			const past = getPastForPath(wt.path, wt.branch);
			if (past) {
				setSelected({
					worktree: wt,
					existingSessionId: past.session_id,
					isPastSession: true,
				});
				return;
			}

			// No session — open for new agent
			setSelected({ worktree: wt });
		},
		[getActiveForPath, getPastForPath],
	);

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
						<AccountTreeRoundedIcon sx={{ color: '#7C5CFF', fontSize: '1.1rem' }} />
						<Typography
							variant="subtitle2"
							sx={{ fontWeight: 700, letterSpacing: 0.5 }}
						>
							Worktrees
						</Typography>
						{activeSessions.length > 0 && (
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
								{activeSessions.length}
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
							counts={viewCounts}
						/>
					</Box>
				)}

				{/* Content */}
				<Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
					{worktrees.length > 0 ? (
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
							{worktrees.map((wt) => {
								const active = getActiveForPath(wt.path);
								const past = !active ? getPastForPath(wt.path, wt.branch) : null;
								return (
									<SidebarWorktreeCard
										key={wt.path}
										worktree={wt}
										activeSession={active}
										pastSession={past}
										onClick={() => handleWorktreeClick(wt)}
										onStop={active ? () => killSession(active.sessionId) : undefined}
									/>
								);
							})}
						</Box>
					) : (
						<Box
							sx={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								py: 6,
								gap: 1,
							}}
						>
							<AccountTreeRoundedIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
							<Typography
								variant="caption"
								sx={{ color: 'text.disabled', textAlign: 'center' }}
							>
								Aucun worktree sur ce projet
							</Typography>
						</Box>
					)}
				</Box>
			</Drawer>

			<AgentTerminalModal
				open={!!selected}
				onClose={() => setSelected(null)}
				projectPath={activeView?.path}
				existingSessionId={selected?.existingSessionId}
				isPastSession={selected?.isPastSession}
				existingWorktree={
					selected && !selected.existingSessionId
						? {
								branch: selected.worktree.branch,
								worktreePath: selected.worktree.path,
							}
						: undefined
				}
			/>
		</>
	);
}
