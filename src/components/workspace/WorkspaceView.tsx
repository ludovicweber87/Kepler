'use client';

import { useState } from 'react';
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
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import DraggableTabs from '@/components/shared/DraggableTabs';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useWorktrees, type WorktreeInfo } from '@/hooks/useWorktrees';
import { useSessionManager, type AgentSession } from '@/hooks/useSessionManager';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

function WorktreeCard({
	worktree,
	onClick,
	onDelete,
	onStop,
	hasActiveSession,
	pastSession,
}: {
	worktree: WorktreeInfo;
	onClick: () => void;
	onDelete: () => void;
	onStop?: () => void;
	hasActiveSession?: boolean;
	pastSession?: AgentSession | null;
}) {
	const isFinished = !hasActiveSession && !!pastSession;
	const isError = pastSession?.status === 'error';

	const borderColor = hasActiveSession
		? alpha('#22C55E', 0.25)
		: isFinished
			? alpha(isError ? '#EF4444' : '#9E9E9E', 0.2)
			: 'divider';
	const bgColor = hasActiveSession
		? alpha('#22C55E', 0.04)
		: isFinished
			? alpha(isError ? '#EF4444' : '#9E9E9E', 0.04)
			: 'background.paper';

	return (
		<Box
			onClick={onClick}
			sx={{
				p: 2,
				borderRadius: 1,
				bgcolor: bgColor,
				border: 1,
				borderColor,
				transition: 'all 0.15s',
				cursor: 'pointer',
				opacity: isFinished ? 0.55 : 1,
				'&:hover': {
					bgcolor: hasActiveSession
						? alpha('#22C55E', 0.08)
						: isFinished
							? alpha(isError ? '#EF4444' : '#9E9E9E', 0.08)
							: 'action.hover',
					borderColor: hasActiveSession
						? alpha('#22C55E', 0.35)
						: isFinished
							? alpha(isError ? '#EF4444' : '#9E9E9E', 0.3)
							: 'action.disabled',
					transform: 'translateY(-1px)',
					opacity: isFinished ? 0.75 : 1,
				},
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
				{isFinished ? (
					isError ? (
						<ErrorOutlineRoundedIcon sx={{ fontSize: 16, color: '#EF4444' }} />
					) : (
						<CheckCircleOutlineRoundedIcon sx={{ fontSize: 16, color: '#9E9E9E' }} />
					)
				) : (
					<AccountTreeRoundedIcon sx={{ fontSize: 16, color: '#7C5CFF' }} />
				)}
				<Typography
					variant="body2"
					sx={{
						fontWeight: 600,
						fontSize: '0.85rem',
						flex: 1,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						color: isFinished ? 'text.secondary' : 'text.primary',
					}}
				>
					{worktree.branch}
				</Typography>

				{hasActiveSession && (
					<Chip
						label="Active"
						size="small"
						sx={{
							height: 20,
							fontSize: '0.65rem',
							fontWeight: 600,
							bgcolor: alpha('#22C55E', 0.12),
							color: '#22C55E',
							border: `1px solid ${alpha('#22C55E', 0.25)}`,
						}}
					/>
				)}
				{isFinished && !isError && (
					<Chip
						label="Terminé"
						size="small"
						sx={{
							height: 20,
							fontSize: '0.65rem',
							fontWeight: 600,
							bgcolor: alpha('#9E9E9E', 0.12),
							color: '#9E9E9E',
							border: `1px solid ${alpha('#9E9E9E', 0.25)}`,
						}}
					/>
				)}
				{isFinished && isError && (
					<Chip
						label="Erreur"
						size="small"
						sx={{
							height: 20,
							fontSize: '0.65rem',
							fontWeight: 600,
							bgcolor: alpha('#EF4444', 0.12),
							color: '#EF4444',
							border: `1px solid ${alpha('#EF4444', 0.25)}`,
						}}
					/>
				)}

				{isFinished && pastSession?.agent_name && (
					<Typography
						variant="caption"
						sx={{
							color: 'text.disabled',
							fontSize: '0.6rem',
							fontWeight: 600,
						}}
					>
						{pastSession.agent_name}
					</Typography>
				)}

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
		isPastSession?: boolean;
	} | null>(null);

	const activeView = views[activeIndex] ?? null;
	const { worktrees, isLoading, deleteWorktree } = useWorktrees(activeView?.path);
	const { killSession, getActiveForPath, getPastForPath } = useSessionManager();

	const handleWorktreeClick = (wt: WorktreeInfo) => {
		// Same logic as sidebar: check active first, then past
		const active = getActiveForPath(wt.path);
		if (active) {
			setSelectedWorktree({ worktree: wt, existingSessionId: active.sessionId });
			return;
		}

		const past = getPastForPath(wt.path, wt.branch);
		if (past) {
			setSelectedWorktree({
				worktree: wt,
				existingSessionId: past.session_id,
				isPastSession: true,
			});
			return;
		}

		// No session — open in existing worktree, skip branch step
		setSelectedWorktree({ worktree: wt });
	};

	const handleConfirmDelete = () => {
		if (deleteTarget) {
			deleteWorktree(deleteTarget.path);
			setDeleteTarget(null);
		}
	};

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

			{isLoading && (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
					<CircularProgress size={28} sx={{ color: '#7C5CFF' }} />
				</Box>
			)}

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

			{!isLoading && worktrees.length > 0 && (
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					{worktrees.map((wt) => {
						const active = getActiveForPath(wt.path);
						const past = !active ? getPastForPath(wt.path, wt.branch) : null;
						return (
							<WorktreeCard
								key={wt.path}
								worktree={wt}
								onClick={() => handleWorktreeClick(wt)}
								onDelete={() => setDeleteTarget(wt)}
								hasActiveSession={!!active}
								pastSession={past}
								onStop={active ? () => killSession(active.sessionId) : undefined}
							/>
						);
					})}
				</Box>
			)}

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

			<AgentTerminalModal
				open={newAgentOpen}
				onClose={() => setNewAgentOpen(false)}
				projectPath={activeView?.path}
			/>

			<AgentTerminalModal
				open={!!selectedWorktree}
				onClose={() => setSelectedWorktree(null)}
				projectPath={activeView?.path}
				existingSessionId={selectedWorktree?.existingSessionId}
				isPastSession={selectedWorktree?.isPastSession}
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
