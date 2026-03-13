'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useRightSidebar } from '@/hooks/useRightSidebar';
import { useWorktrees, type WorktreeInfo } from '@/hooks/useWorktrees';
import { useSessionManager } from '@/hooks/useSessionManager';
import DraggableTabs from '@/components/shared/DraggableTabs';
import SessionCard from '@/components/shared/SessionCard';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

export const RIGHT_SIDEBAR_WIDTH = 400;
const MIN_WIDTH = 400;
const MAX_WIDTH = 400;


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
								const isError = past?.status === 'error';
								return (
									<SessionCard
										key={wt.path}
										name={wt.branch}
										subtitle={wt.path.split('/').slice(-2).join('/')}
										status={
											active ? 'active'
												: past ? (isError ? 'error' : 'completed')
													: 'idle'
										}
										isStreaming={active?.isStreaming}
										onClick={() => handleWorktreeClick(wt)}
										onStop={active ? () => killSession(active.sessionId) : undefined}
										compact
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
