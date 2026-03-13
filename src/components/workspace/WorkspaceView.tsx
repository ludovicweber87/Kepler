'use client';

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { useQueryClient } from '@tanstack/react-query';
import DraggableTabs from '@/components/shared/DraggableTabs';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useWorktrees, type WorktreeInfo } from '@/hooks/useWorktrees';
import { useActiveSessions } from '@/hooks/useActiveSessions';
import { useDevServers } from '@/hooks/useDevServers';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

interface DevServerInfo {
	pid: number;
	port: number;
}

function WorktreeCard({
	worktree,
	onClick,
	onDelete,
	onStop,
	hasActiveSession,
	devServer,
	onStartDevServer,
	onStopDevServer,
	isStartingServer,
}: {
	worktree: WorktreeInfo;
	onClick: () => void;
	onDelete: () => void;
	onStop?: () => void;
	hasActiveSession?: boolean;
	devServer: DevServerInfo | null;
	onStartDevServer: () => void;
	onStopDevServer: () => void;
	isStartingServer?: boolean;
}) {
	return (
		<Box
			onClick={onClick}
			sx={{
				p: 2,
				borderRadius: 1,
				bgcolor: 'background.paper',
				border: 1,
				borderColor: 'divider',
				transition: 'all 0.15s',
				cursor: 'pointer',
				'&:hover': {
					bgcolor: 'action.hover',
					borderColor: 'action.disabled',
					transform: 'translateY(-1px)',
				},
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
				<AccountTreeRoundedIcon sx={{ fontSize: 16, color: '#7C5CFF' }} />
				<Typography
					variant="body2"
					sx={{
						fontWeight: 600,
						fontSize: '0.85rem',
						flex: 1,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{worktree.branch}
				</Typography>

				{/* Dev server: start or open */}
				{devServer ? (
					<>
						<Tooltip title={`Ouvrir localhost:${devServer.port}`}>
							<IconButton
								size="small"
								onClick={(e) => {
									e.stopPropagation();
									window.open(`http://localhost:${devServer.port}`, '_blank');
								}}
								sx={{
									color: '#22C55E',
									'&:hover': { bgcolor: alpha('#22C55E', 0.1) },
								}}
							>
								<OpenInNewRoundedIcon sx={{ fontSize: 18 }} />
							</IconButton>
						</Tooltip>
						<Tooltip title="Arrêter le serveur de dev">
							<IconButton
								size="small"
								onClick={(e) => {
									e.stopPropagation();
									onStopDevServer();
								}}
								sx={{
									color: '#F59E0B',
									'&:hover': { bgcolor: alpha('#F59E0B', 0.1) },
								}}
							>
								<StopCircleRoundedIcon sx={{ fontSize: 18 }} />
							</IconButton>
						</Tooltip>
					</>
				) : (
					<Tooltip title="Lancer le serveur de dev">
						<IconButton
							size="small"
							disabled={isStartingServer}
							onClick={(e) => {
								e.stopPropagation();
								onStartDevServer();
							}}
							sx={{
								color: '#22C55E',
								'&:hover': { bgcolor: alpha('#22C55E', 0.1) },
							}}
						>
							{isStartingServer ? (
								<CircularProgress size={16} sx={{ color: '#22C55E' }} />
							) : (
								<PlayArrowRoundedIcon sx={{ fontSize: 18 }} />
							)}
						</IconButton>
					</Tooltip>
				)}

				{/* Stop agent session */}
				{hasActiveSession && onStop && (
					<Tooltip title="Arrêter la session">
						<IconButton
							size="small"
							onClick={(e) => {
								e.stopPropagation();
								onStop();
							}}
							sx={{
								color: '#EF4444',
								'&:hover': { bgcolor: alpha('#EF4444', 0.1) },
							}}
						>
							<StopCircleRoundedIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				)}

				{/* Delete worktree */}
				<Tooltip title="Delete worktree">
					<IconButton
						size="small"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						sx={{
							color: 'text.disabled',
							'&:hover': { color: '#EF4444', bgcolor: alpha('#EF4444', 0.1) },
						}}
					>
						<DeleteOutlineRoundedIcon fontSize="small" />
					</IconButton>
				</Tooltip>
			</Box>

			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
				<FolderRoundedIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
				<Typography
					variant="caption"
					sx={{
						color: 'text.disabled',
						fontSize: '0.65rem',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						flex: 1,
					}}
				>
					{worktree.path}
				</Typography>
				{devServer && (
					<Typography
						variant="caption"
						sx={{
							color: '#22C55E',
							fontSize: '0.65rem',
							fontWeight: 600,
							fontFamily: 'monospace',
							flexShrink: 0,
						}}
					>
						:{devServer.port}
					</Typography>
				)}
			</Box>
		</Box>
	);
}

export default function WorkspaceView() {
	const { views, activeIndex, setActiveIndex, addView, reorderViews } = useAgentViews();
	const [deleteTarget, setDeleteTarget] = useState<WorktreeInfo | null>(null);
	const [newAgentOpen, setNewAgentOpen] = useState(false);
	const [selectedWorktree, setSelectedWorktree] = useState<{
		worktree: WorktreeInfo;
		existingSessionId?: string;
	} | null>(null);

	const queryClient = useQueryClient();
	const activeView = views[activeIndex] ?? null;
	const { worktrees, isLoading, deleteWorktree } = useWorktrees(activeView?.path);
	const { data: activeSessions } = useActiveSessions();
	const { startServer, stopServer, getServerForPath, isStarting } = useDevServers();

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

	const handleWorktreeClick = (wt: WorktreeInfo) => {
		// Find active session whose cwd matches this worktree path
		const session = activeSessions?.find((s) => s.cwd === wt.path);
		if (session) {
			// Re-attach to existing session
			setSelectedWorktree({ worktree: wt, existingSessionId: session.sessionId });
		} else {
			// Open in existing worktree — skip branch step
			setSelectedWorktree({ worktree: wt });
		}
	};

	const handleConfirmDelete = () => {
		if (deleteTarget) {
			deleteWorktree(deleteTarget.path);
			setDeleteTarget(null);
		}
	};

	// No views — empty state
	if (views.length === 0) {
		return (
			<Box sx={{ p: 4, maxWidth: 1000, mx: 'auto' }}>
				<Typography
					variant="h4"
					sx={{
						fontWeight: 700,
						mb: 4,
						background: 'linear-gradient(135deg, #7C5CFF 0%, #00E5FF 100%)',
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					Worktrees
				</Typography>
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						py: 12,
						gap: 2,
					}}
				>
					<FolderOpenRoundedIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
					<Typography variant="h6" color="text.secondary">
						No project configured
					</Typography>
					<Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
						Add a project to see its worktrees.
					</Typography>
					<Button
						variant="outlined"
						startIcon={<AddRoundedIcon />}
						onClick={() => addView()}
						sx={{
							borderColor: '#7C5CFF',
							color: '#7C5CFF',
							textTransform: 'none',
							'&:hover': {
								borderColor: '#7C5CFF',
								bgcolor: alpha('#7C5CFF', 0.08),
							},
						}}
					>
						Add Project
					</Button>
				</Box>
			</Box>
		);
	}

	return (
		<Box sx={{ p: 4, maxWidth: 1000, mx: 'auto' }}>
			{/* Header */}
			<Typography
				variant="h4"
				sx={{
					fontWeight: 700,
					mb: 3,
					background: 'linear-gradient(135deg, #7C5CFF 0%, #00E5FF 100%)',
					WebkitBackgroundClip: 'text',
					WebkitTextFillColor: 'transparent',
				}}
			>
				Worktrees
			</Typography>

			{/* View tabs */}
			<DraggableTabs
				tabs={views.map((v) => v.label)}
				activeTab={activeIndex}
				onTabChange={setActiveIndex}
				onReorder={reorderViews}
				trailing={
					<Tooltip title="Add project">
						<IconButton
							size="small"
							onClick={() => addView()}
							sx={{
								color: 'text.disabled',
								'&:hover': { color: '#7C5CFF' },
							}}
						>
							<AddRoundedIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				}
			/>

			{/* Start Agent button */}
			<Box sx={{ pt: 2, pb: 1 }}>
				<Button
					size="small"
					variant="outlined"
					startIcon={<SmartToyRoundedIcon />}
					onClick={() => setNewAgentOpen(true)}
					sx={{
						textTransform: 'none',
						fontWeight: 600,
						fontSize: '0.8rem',
						color: '#7C5CFF',
						borderColor: alpha('#7C5CFF', 0.3),
						'&:hover': {
							borderColor: '#7C5CFF',
							bgcolor: alpha('#7C5CFF', 0.08),
						},
					}}
				>
					Lancer un agent
				</Button>
			</Box>

			{/* Loading */}
			{isLoading && (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
					<CircularProgress size={28} sx={{ color: '#7C5CFF' }} />
				</Box>
			)}

			{/* Empty state */}
			{!isLoading && worktrees.length === 0 && (
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						py: 12,
						gap: 1,
					}}
				>
					<AccountTreeRoundedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
					<Typography variant="body1" color="text.secondary">
						No active worktrees
					</Typography>
					<Typography variant="body2" color="text.disabled">
						Create a branch from an issue to get started.
					</Typography>
				</Box>
			)}

			{/* Worktree list */}
			{!isLoading && worktrees.length > 0 && (
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					{worktrees.map((wt) => {
						const activeSession = activeSessions?.find((s) => s.cwd === wt.path);
						const devServer = getServerForPath(wt.path);
						return (
							<WorktreeCard
								key={wt.path}
								worktree={wt}
								onClick={() => handleWorktreeClick(wt)}
								onDelete={() => setDeleteTarget(wt)}
								hasActiveSession={!!activeSession}
								onStop={activeSession ? () => handleKillSession(activeSession.sessionId) : undefined}
								devServer={devServer ? { pid: devServer.pid, port: devServer.port } : null}
								onStartDevServer={() => startServer({ cwd: wt.path, branch: wt.branch })}
								onStopDevServer={() => devServer && stopServer(devServer.pid)}
								isStartingServer={isStarting}
							/>
						);
					})}
				</Box>
			)}

			{/* Delete confirmation dialog */}
			<Dialog
				open={!!deleteTarget}
				onClose={() => setDeleteTarget(null)}
				maxWidth="xs"
				fullWidth
				PaperProps={{ sx: { borderRadius: 1 } }}
			>
				<DialogTitle sx={{ fontWeight: 600 }}>Delete worktree</DialogTitle>
				<DialogContent>
					<Typography variant="body2" color="text.secondary">
						This will remove the worktree and attempt to delete the local branch{' '}
						<strong>{deleteTarget?.branch}</strong>.
					</Typography>
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2.5 }}>
					<Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
					<Button
						variant="contained"
						onClick={handleConfirmDelete}
						sx={{
							bgcolor: '#EF4444',
							'&:hover': { bgcolor: alpha('#EF4444', 0.85) },
							textTransform: 'none',
							fontWeight: 600,
						}}
					>
						Delete
					</Button>
				</DialogActions>
			</Dialog>

			{/* Agent terminal modal — new agent (stepper: branch → terminal) */}
			<AgentTerminalModal
				open={newAgentOpen}
				onClose={() => setNewAgentOpen(false)}
				projectPath={activeView?.path}
			/>

			{/* Agent terminal modal — existing worktree click */}
			<AgentTerminalModal
				open={!!selectedWorktree}
				onClose={() => setSelectedWorktree(null)}
				projectPath={activeView?.path}
				existingSessionId={selectedWorktree?.existingSessionId}
				existingWorktree={
					selectedWorktree && !selectedWorktree.existingSessionId
						? {
								branch: selectedWorktree.worktree.branch,
								worktreePath: selectedWorktree.worktree.path,
							}
						: undefined
				}
			/>
		</Box>
	);
}
