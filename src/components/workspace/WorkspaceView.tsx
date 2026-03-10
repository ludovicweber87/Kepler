'use client';

import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import Button from '@mui/material/Button';
import DraggableTabs from '@/components/shared/DraggableTabs';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useBranches, type Branch } from '@/hooks/useBranches';
import BranchDetail from './BranchDetail';

function timeAgo(dateStr: string): string {
	if (!dateStr) return '';
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return 'now';
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function BranchCard({
	branch,
	repoLabel,
	onClick,
}: {
	branch: Branch;
	repoLabel: string;
	onClick: () => void;
}) {
	return (
		<Box
			onClick={onClick}
			sx={{
				p: 2,
				borderRadius: 1,
				bgcolor: branch.isCurrent ? alpha('#7C5CFF', 0.06) : alpha('#fff', 0.02),
				border: 1,
				borderColor: branch.isCurrent ? alpha('#7C5CFF', 0.15) : alpha('#fff', 0.06),
				cursor: 'pointer',
				transition: 'all 0.15s',
				'&:hover': {
					bgcolor: branch.isCurrent ? alpha('#7C5CFF', 0.12) : alpha('#fff', 0.05),
					borderColor: branch.isCurrent ? alpha('#7C5CFF', 0.25) : alpha('#fff', 0.12),
					transform: 'translateY(-1px)',
				},
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
				<AccountTreeRoundedIcon
					sx={{
						fontSize: 16,
						color: branch.isCurrent ? '#7C5CFF' : 'text.disabled',
					}}
				/>
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
					{branch.name}
				</Typography>
				{branch.isCurrent && (
					<Chip
						icon={
							<FiberManualRecordRoundedIcon
								sx={{ fontSize: '8px !important', color: '#4CAF50 !important' }}
							/>
						}
						label="current"
						size="small"
						sx={{
							height: 20,
							fontSize: '0.6rem',
							fontWeight: 600,
							bgcolor: alpha('#4CAF50', 0.1),
							color: '#4CAF50',
						}}
					/>
				)}
				<Typography
					variant="caption"
					sx={{ color: 'text.disabled', fontSize: '0.65rem', flexShrink: 0 }}
				>
					{timeAgo(branch.lastCommitDate)}
				</Typography>
			</Box>

			<Typography
				variant="body2"
				sx={{
					fontSize: '0.75rem',
					color: 'text.secondary',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					mb: 0.5,
				}}
			>
				{branch.lastCommitMessage}
			</Typography>

			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
				<Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
					{branch.lastCommitAuthor}
				</Typography>
				<Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>
					{repoLabel}
				</Typography>
			</Box>
		</Box>
	);
}

interface SelectedBranch {
	branch: Branch;
	viewIndex: number;
}

export default function WorkspaceView() {
	const { views, activeIndex, setActiveIndex, addView, reorderViews } = useAgentViews();
	const [selected, setSelected] = useState<SelectedBranch | null>(null);

	// Fetch branches for the active view
	const activeView = views[activeIndex] ?? null;
	const { data: branches = [], isLoading } = useBranches(activeView?.path);

	// Sort: current branch first, then by date
	const sortedBranches = useMemo(() => {
		return [...branches].sort((a, b) => {
			if (a.isCurrent && !b.isCurrent) return -1;
			if (!a.isCurrent && b.isCurrent) return 1;
			return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime();
		});
	}, [branches]);

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
					Workspace
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
						Add a project to see its branches.
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

	// Branch detail view
	if (selected) {
		const view = views[selected.viewIndex];
		return (
			<Box sx={{ p: 4, maxWidth: 1000, mx: 'auto' }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
					<IconButton
						size="small"
						onClick={() => setSelected(null)}
						sx={{ color: 'text.secondary' }}
					>
						<ArrowBackRoundedIcon />
					</IconButton>
					<AccountTreeRoundedIcon sx={{ color: '#7C5CFF', fontSize: 20 }} />
					<Typography variant="h5" sx={{ fontWeight: 700 }}>
						{selected.branch.name}
					</Typography>
					<Chip
						label={view?.label}
						size="small"
						sx={{
							height: 22,
							fontSize: '0.65rem',
							fontWeight: 600,
							bgcolor: alpha('#00E5FF', 0.1),
							color: '#00E5FF',
						}}
					/>
				</Box>
				<BranchDetail
					branch={selected.branch}
					localPath={view?.path}
					repoFullName={view?.repoFullName}
				/>
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
				Workspace
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

			{/* Loading */}
			{isLoading && (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
					<CircularProgress size={28} sx={{ color: '#7C5CFF' }} />
				</Box>
			)}

			{/* Empty state */}
			{!isLoading && sortedBranches.length === 0 && (
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
						No branches found
					</Typography>
				</Box>
			)}

			{/* Branch list */}
			{!isLoading && sortedBranches.length > 0 && (
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					{sortedBranches.map((branch) => (
						<BranchCard
							key={branch.name}
							branch={branch}
							repoLabel={activeView?.label ?? ''}
							onClick={() => setSelected({ branch, viewIndex: activeIndex })}
						/>
					))}
				</Box>
			)}
		</Box>
	);
}
