'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import { alpha, useTheme } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import DraggableTabs from '@/components/shared/DraggableTabs';
import SessionCard from '@/components/shared/SessionCard';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useWorktrees, type WorktreeInfo } from '@/hooks/useWorktrees';
import { useSessionManager } from '@/hooks/useSessionManager';
import { usePendingQuestions } from '@/hooks/usePendingQuestions';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';


export default function WorkspaceView() {
	const theme = useTheme();
	const t = useTranslations('workspace');
	const { views, activeIndex, setActiveIndex, addView, reorderViews } = useAgentViews();
	const [deleteTarget, setDeleteTarget] = useState<WorktreeInfo | null>(null);
	const [deleteAnchorEl, setDeleteAnchorEl] = useState<HTMLElement | null>(null);
	const [newAgentOpen, setNewAgentOpen] = useState(false);
	const [selectedWorktree, setSelectedWorktree] = useState<{
		worktree: WorktreeInfo;
		existingSessionId?: string;
		isPastSession?: boolean;
	} | null>(null);

	const activeView = views[activeIndex] ?? null;
	const { worktrees, isLoading, deleteWorktree } = useWorktrees(activeView?.path);
	const { killSession, getActiveForPath, getPastForPath, fetchSessionForPath } = useSessionManager();
	const pendingQuestions = usePendingQuestions();

	const sortedWorktrees = useMemo(
		() => [...worktrees].sort((a, b) => {
			const aActive = !!getActiveForPath(a.path);
			const bActive = !!getActiveForPath(b.path);
			if (aActive === bActive) return 0;
			return aActive ? -1 : 1;
		}),
		[worktrees, getActiveForPath],
	);

	const handleWorktreeClick = async (wt: WorktreeInfo) => {
		// 1. Active tmux session? → re-attach
		const active = getActiveForPath(wt.path);
		if (active) {
			setSelectedWorktree({ worktree: wt, existingSessionId: active.sessionId });
			return;
		}

		// 2. Direct DB check — always fresh, bypasses cache timing issues
		const dbSession = await fetchSessionForPath(wt.path);
		if (dbSession) {
			const isDone = dbSession.status === 'completed' || dbSession.status === 'error';
			setSelectedWorktree({
				worktree: wt,
				existingSessionId: dbSession.session_id,
				isPastSession: isDone,
			});
			return;
		}

		// 3. No session at all — open in existing worktree, skip branch step
		setSelectedWorktree({ worktree: wt });
	};

	const handleDelete = (deleteBranch: boolean) => {
		if (deleteTarget) {
			deleteWorktree({ worktreePath: deleteTarget.path, deleteBranch });
			setDeleteTarget(null);
			setDeleteAnchorEl(null);
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
						background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					{t('title')}
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
						{t('noProjectConfigured')}
					</Typography>
					<Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
						{t('addProjectDesc')}
					</Typography>
					<Button
						variant="outlined"
						startIcon={<AddRoundedIcon />}
						onClick={() => addView()}
						sx={{
							borderColor: theme.palette.primary.main,
							color: theme.palette.primary.main,
							textTransform: 'none',
							'&:hover': {
								borderColor: theme.palette.primary.main,
								bgcolor: alpha(theme.palette.primary.main, 0.08),
							},
						}}
					>
						{t('addProject')}
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
					background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
					WebkitBackgroundClip: 'text',
					WebkitTextFillColor: 'transparent',
				}}
			>
				{t('title')}
			</Typography>

			<DraggableTabs
				tabs={views.map((v) => v.label)}
				activeTab={activeIndex}
				onTabChange={setActiveIndex}
				onReorder={reorderViews}
				trailing={
					<Tooltip title={t('addProject')}>
						<IconButton
							size="small"
							onClick={() => addView()}
							sx={{
								color: 'text.disabled',
								'&:hover': { color: theme.palette.primary.main },
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
						color: theme.palette.primary.main,
						borderColor: alpha(theme.palette.primary.main, 0.3),
						'&:hover': {
							borderColor: theme.palette.primary.main,
							bgcolor: alpha(theme.palette.primary.main, 0.08),
						},
					}}
				>
					{t('launchAgent')}
				</Button>
			</Box>

			{isLoading && (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
					<CircularProgress size={28} sx={{ color: theme.palette.primary.main }} />
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
						{t('noActiveWorktrees')}
					</Typography>
					<Typography variant="body2" color="text.disabled">
						{t('createBranchDesc')}
					</Typography>
				</Box>
			)}

			{!isLoading && worktrees.length > 0 && (
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					{sortedWorktrees.map((wt) => {
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
								hasPendingQuestion={pendingQuestions.has(wt.path)}
								onClick={() => handleWorktreeClick(wt)}
								onStop={active ? () => killSession(active.sessionId) : undefined}
								onDelete={(e) => {
									setDeleteTarget(wt);
									setDeleteAnchorEl(e.currentTarget as HTMLElement);
								}}
							/>
						);
					})}
				</Box>
			)}

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
					{t('deleteBranch', { branch: deleteTarget?.branch ?? '' })}
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
					{t('worktreeOnly')}
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
					{t('worktreeAndBranch')}
				</Button>
			</Popover>

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
