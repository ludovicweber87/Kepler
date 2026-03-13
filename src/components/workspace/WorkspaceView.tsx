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
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import DraggableTabs from '@/components/shared/DraggableTabs';
import SessionCard from '@/components/shared/SessionCard';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useWorktrees, type WorktreeInfo } from '@/hooks/useWorktrees';
import { useSessionManager } from '@/hooks/useSessionManager';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';


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
						const isError = past?.status === 'error';
						return (
							<SessionCard
								key={wt.path}
								name={wt.branch}
								subtitle={wt.path}
								status={
									active ? 'active'
										: past ? (isError ? 'error' : 'completed')
											: 'idle'
								}
								isStreaming={active?.isStreaming}
								onClick={() => handleWorktreeClick(wt)}
								onStop={active ? () => killSession(active.sessionId) : undefined}
								onDelete={() => setDeleteTarget(wt)}
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
