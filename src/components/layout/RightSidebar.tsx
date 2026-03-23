'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import { alpha, useTheme } from '@mui/material/styles';
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useRightSidebar } from '@/hooks/useRightSidebar';
import { useWorktrees, type WorktreeInfo } from '@/hooks/useWorktrees';
import { useSessionManager } from '@/hooks/useSessionManager';
import { usePendingQuestions } from '@/hooks/usePendingQuestions';
import DraggableTabs from '@/components/shared/DraggableTabs';
import SessionCard from '@/components/shared/SessionCard';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

export const RIGHT_SIDEBAR_WIDTH = 400;
const MIN_WIDTH = 400;
const MAX_WIDTH = 400;

export default function RightSidebar() {
	const theme = useTheme();
	const { open, width, setWidth } = useRightSidebar();
	const { views, reorderViews } = useAgentViews();
	const {
		activeSessions,
		pastSessions,
		killSession,
		getActiveForPath,
		getPastForPath,
		fetchSessionForPath,
	} = useSessionManager();
	const pendingQuestions = usePendingQuestions();
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
	const { worktrees, deleteWorktree } = useWorktrees(activeView?.path);
	const [deleteTarget, setDeleteTarget] = useState<WorktreeInfo | null>(null);
	const [deleteAnchorEl, setDeleteAnchorEl] = useState<HTMLElement | null>(null);

	// Build unified workers list: worktrees + direct sessions (not in any worktree)
	type WorkerItem =
		| { type: 'worktree'; worktree: WorktreeInfo; key: string }
		| {
			type: 'direct';
			session: import('@/hooks/useActiveSessions').ActiveSession;
			key: string;
		};

	const workers = useMemo(() => {
		const worktreePaths = new Set(worktrees.map((wt) => wt.path));

		// Worktree items
		const wtItems: WorkerItem[] = worktrees.map((wt) => ({
			type: 'worktree' as const,
			worktree: wt,
			key: `wt-${wt.path}`,
		}));

		// Direct sessions: active sessions in this project but not in any worktree
		const directItems: WorkerItem[] = activeView?.path
			? activeSessions
				.filter((s) => s.cwd.startsWith(activeView.path) && !worktreePaths.has(s.cwd))
				.map((s) => ({
					type: 'direct' as const,
					session: s,
					key: `direct-${s.sessionId}`,
				}))
			: [];

		// Merge and sort: active workers first
		const all = [...wtItems, ...directItems];
		return all.sort((a, b) => {
			const aActive = a.type === 'direct' || !!getActiveForPath(a.worktree.path);
			const bActive = b.type === 'direct' || !!getActiveForPath(b.worktree.path);
			if (aActive === bActive) return 0;
			return aActive ? -1 : 1;
		});
	}, [worktrees, activeSessions, activeView?.path, getActiveForPath]);

	// Count active tmux sessions per view for tab badges
	const viewCounts = useMemo(
		() => views.map((v) => activeSessions.filter((s) => s.cwd.startsWith(v.path)).length),
		[views, activeSessions],
	);

	console.log('[RightSidebar] activeSessions:', activeSessions);
	console.log('[RightSidebar] pastSessions:', pastSessions);

	const handleWorktreeClick = useCallback(
		async (wt: WorktreeInfo) => {
			// 1. Active tmux session? → re-attach
			const active = getActiveForPath(wt.path);
			if (active) {
				setSelected({ worktree: wt, existingSessionId: active.sessionId });
				return;
			}

			// 2. Direct DB check — always fresh, bypasses cache timing issues
			const dbSession = await fetchSessionForPath(wt.path);
			if (dbSession) {
				const isDone = dbSession.status === 'completed' || dbSession.status === 'error';
				setSelected({
					worktree: wt,
					existingSessionId: dbSession.session_id,
					isPastSession: isDone,
				});
				return;
			}

			// 3. No session at all — open for new agent
			setSelected({ worktree: wt });
		},
		[getActiveForPath, fetchSessionForPath],
	);

	const handleDelete = (deleteBranch: boolean) => {
		if (deleteTarget) {
			deleteWorktree({ worktreePath: deleteTarget.path, deleteBranch });
			setDeleteTarget(null);
			setDeleteAnchorEl(null);
		}
	};

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
							bgcolor: 'primary.main',
						},
					}}
				/>

				{/* Header */}
				<Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<EngineeringRoundedIcon
							sx={{ color: 'primary.main', fontSize: '1.1rem' }}
						/>
						<Typography
							variant="subtitle2"
							sx={{ fontWeight: 700, letterSpacing: 0.5 }}
						>
							Workers
						</Typography>
						{activeSessions.length > 0 && (
							<Box
								sx={{
									ml: 'auto',
									bgcolor: alpha(theme.palette.success.main, 0.15),
									color: 'success.main',
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
					{workers.length > 0 ? (
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
							{workers.map((worker) => {
								if (worker.type === 'worktree') {
									const wt = worker.worktree;
									const active = getActiveForPath(wt.path);
									const past = !active
										? getPastForPath(wt.path, wt.branch)
										: null;
									const isError = past?.status === 'error';
									return (
										<SessionCard
											key={worker.key}
											name={wt.branch}
											subtitle={wt.path.split('/').slice(-2).join('/')}
											status={
												active
													? 'active'
													: past
														? isError
															? 'error'
															: 'completed'
														: 'idle'
											}
											isStreaming={active?.isStreaming}
											hasPendingQuestion={pendingQuestions.has(wt.path)}
											onClick={() => handleWorktreeClick(wt)}
											onStop={
												active
													? () => killSession(active.sessionId)
													: undefined
											}
											onDelete={
												!active
													? (e) => {
														setDeleteTarget(wt);
														setDeleteAnchorEl(
															e.currentTarget as HTMLElement,
														);
													}
													: undefined
											}
											isWorktree
											compact
										/>
									);
								}
								// Direct session (not in a worktree)
								const s = worker.session;
								return (
									<SessionCard
										key={worker.key}
										name={s.branch ?? s.projectName}
										subtitle={s.cwd.split('/').slice(-2).join('/')}
										status="active"
										isStreaming={s.isStreaming}
										hasPendingQuestion={pendingQuestions.has(s.cwd)}
										onClick={() => {
											// Create a synthetic worktree-like object for the modal
											setSelected({
												worktree: {
													path: s.cwd,
													branch: s.branch ?? 'main',
													head: '',
												},
												existingSessionId: s.sessionId,
											});
										}}
										onStop={() => killSession(s.sessionId)}
										isWorktree={false}
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
							<EngineeringRoundedIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
							<Typography
								variant="caption"
								sx={{ color: 'text.disabled', textAlign: 'center' }}
							>
								No active workers
							</Typography>
						</Box>
					)}
				</Box>
			</Drawer>

			<Popover
				open={!!deleteTarget && !!deleteAnchorEl}
				anchorEl={deleteAnchorEl}
				onClose={() => {
					setDeleteTarget(null);
					setDeleteAnchorEl(null);
				}}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				slotProps={{
					paper: {
						sx: {
							borderRadius: 2,
							p: 1.5,
							minWidth: 260,
							display: 'flex',
							flexDirection: 'column',
							gap: 0.5,
						},
					},
				}}
			>
				<Typography variant="caption" color="text.secondary" sx={{ px: 1, pb: 0.5 }}>
					Supprimer {deleteTarget?.branch ?? ''}
				</Typography>
				<Button
					fullWidth
					size="small"
					onClick={() => handleDelete(false)}
					sx={{
						justifyContent: 'flex-start',
						textTransform: 'none',
						fontWeight: 600,
						color: theme.palette.error.main,
						'&:hover': { bgcolor: alpha(theme.palette.error.main, 0.08) },
					}}
				>
					Worktree uniquement
				</Button>
				<Button
					fullWidth
					size="small"
					onClick={() => handleDelete(true)}
					sx={{
						justifyContent: 'flex-start',
						textTransform: 'none',
						fontWeight: 600,
						color: theme.palette.error.main,
						'&:hover': { bgcolor: alpha(theme.palette.error.main, 0.08) },
					}}
				>
					Worktree + Branche
				</Button>
			</Popover>

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
