'use client';

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Collapse from '@mui/material/Collapse';
import { alpha, useTheme } from '@mui/material/styles';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import MergeTypeRoundedIcon from '@mui/icons-material/MergeTypeRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import DraggableTabs from '@/components/shared/DraggableTabs';
import { useAgentViews } from '@/hooks/useAgentViews';
import { usePullRequests, useMergePR } from '@/hooks/usePullRequests';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useTranslations } from 'next-intl';
import type { GitHubPullRequest, CheckRun } from '@/types';

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}j`;
}

function getAgeBgColor(updatedAt: string): string {
	const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
	if (days <= 1) return 'rgba(76, 175, 80, 0.08)'; // green
	if (days <= 2) return 'rgba(139, 195, 74, 0.08)'; // light green
	if (days <= 3) return 'rgba(205, 220, 57, 0.08)'; // lime
	if (days <= 4) return 'rgba(255, 235, 59, 0.08)'; // yellow
	if (days <= 5) return 'rgba(255, 193, 7, 0.10)'; // amber
	if (days <= 10) return 'rgba(255, 152, 0, 0.10)'; // orange
	if (days <= 15) return 'rgba(255, 87, 34, 0.10)'; // deep orange
	return 'rgba(244, 67, 54, 0.12)'; // red
}

function getAgeBorderColor(updatedAt: string): string {
	const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
	if (days <= 1) return 'rgba(76, 175, 80, 0.20)';
	if (days <= 2) return 'rgba(139, 195, 74, 0.20)';
	if (days <= 3) return 'rgba(205, 220, 57, 0.20)';
	if (days <= 4) return 'rgba(255, 235, 59, 0.20)';
	if (days <= 5) return 'rgba(255, 193, 7, 0.25)';
	if (days <= 10) return 'rgba(255, 152, 0, 0.25)';
	if (days <= 15) return 'rgba(255, 87, 34, 0.25)';
	return 'rgba(244, 67, 54, 0.30)';
}

function CheckIcon({
	status,
	t,
}: {
	status: GitHubPullRequest['check_status'];
	t: (key: string) => string;
}) {
	if (status === 'success') {
		return (
			<Tooltip title={t('checksPassed')}>
				<CheckCircleRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} />
			</Tooltip>
		);
	}
	if (status === 'failure') {
		return (
			<Tooltip title={t('checksFailed')}>
				<CancelRoundedIcon sx={{ fontSize: 16, color: 'error.main' }} />
			</Tooltip>
		);
	}
	if (status === 'pending') {
		return (
			<Tooltip title={t('checksInProgress')}>
				<AccessTimeRoundedIcon sx={{ fontSize: 16, color: 'warning.main' }} />
			</Tooltip>
		);
	}
	return null;
}

function CheckRunItem({ run }: { run: CheckRun }) {
	const theme = useTheme();
	const isCompleted = run.status === 'completed';
	const isSuccess =
		run.conclusion === 'success' ||
		run.conclusion === 'neutral' ||
		run.conclusion === 'skipped';

	let color = theme.palette.warning.main;
	let Icon = AccessTimeRoundedIcon;
	if (isCompleted) {
		if (isSuccess) {
			color = theme.palette.success.main;
			Icon = CheckCircleRoundedIcon;
		} else {
			color = theme.palette.error.main;
			Icon = CancelRoundedIcon;
		}
	}

	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
			<Icon sx={{ fontSize: 13, color }} />
			<Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
				{run.name}
			</Typography>
			{run.conclusion && (
				<Typography
					variant="caption"
					sx={{ color: 'text.disabled', fontSize: '0.65rem', ml: 'auto' }}
				>
					{run.conclusion}
				</Typography>
			)}
		</Box>
	);
}

function ChecksDetail({
	runs,
	t,
}: {
	runs: CheckRun[];
	t: (key: string, values?: Record<string, number>) => string;
}) {
	const [expanded, setExpanded] = useState(false);

	if (runs.length === 0) return null;

	const passed = runs.filter(
		(r) =>
			r.status === 'completed' &&
			(r.conclusion === 'success' ||
				r.conclusion === 'neutral' ||
				r.conclusion === 'skipped'),
	).length;

	return (
		<Box sx={{ mt: 0.5 }}>
			<Box
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setExpanded(!expanded);
				}}
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.5,
					cursor: 'pointer',
					'&:hover': { '& .MuiTypography-root': { color: 'text.primary' } },
				}}
			>
				<Typography
					variant="caption"
					sx={{ color: 'text.disabled', fontSize: '0.7rem', transition: 'color 0.15s' }}
				>
					{t('checksPassedCount', { passed, total: runs.length })}
				</Typography>
				{expanded ? (
					<ExpandLessRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
				) : (
					<ExpandMoreRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
				)}
			</Box>
			<Collapse in={expanded}>
				<Box sx={{ mt: 0.5, pl: 0.5 }}>
					{runs.map((run) => (
						<CheckRunItem key={run.name} run={run} />
					))}
				</Box>
			</Collapse>
		</Box>
	);
}

function PRCard({
	pr,
	onMerge,
	t,
}: {
	pr: GitHubPullRequest;
	onMerge: (pr: GitHubPullRequest) => void;
	t: (key: string, values?: Record<string, number>) => string;
}) {
	const totalChanges = pr.additions + pr.deletions;
	const bgColor = getAgeBgColor(pr.updated_at);
	const borderColor = getAgeBorderColor(pr.updated_at);
	const canMerge = pr.check_status === 'success' && !pr.draft;

	return (
		<Box
			sx={(theme) => ({
				display: 'flex',
				alignItems: 'flex-start',
				gap: 2,
				px: 2.5,
				py: 2,
				borderRadius: 1,
				bgcolor: bgColor,
				border: 1,
				borderColor,
				transition: 'transform 0.1s, box-shadow 0.15s',
				'&:hover': {
					transform: 'translateX(4px)',
					boxShadow: `0 4px 16px ${alpha(theme.palette.success.main, 0.1)}`,
					'& .open-icon': { opacity: 1 },
				},
			})}
		>
			{/* Avatar */}
			<Avatar
				src={pr.user.avatar_url}
				alt={pr.user.login}
				sx={{ width: 32, height: 32, mt: 0.25 }}
			/>

			{/* Content */}
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
					<CheckIcon status={pr.check_status} t={t} />
					<Typography
						component="a"
						href={pr.html_url}
						target="_blank"
						rel="noopener noreferrer"
						variant="body2"
						sx={{
							fontWeight: 600,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
							flex: 1,
							color: 'inherit',
							textDecoration: 'none',
							'&:hover': { textDecoration: 'underline' },
						}}
					>
						{pr.title}
					</Typography>
					{pr.draft && (
						<Chip
							label={t('draft')}
							size="small"
							sx={(theme) => ({
								height: 20,
								fontSize: '0.65rem',
								bgcolor: alpha(theme.palette.text.disabled, 0.15),
								color: 'text.disabled',
							})}
						/>
					)}
				</Box>

				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
					<Typography variant="caption" sx={{ color: 'text.disabled' }}>
						#{pr.number} · {pr.head.ref}
					</Typography>

					{pr.labels.length > 0 &&
						pr.labels.slice(0, 3).map((label) => (
							<Chip
								key={label.name}
								label={label.name}
								size="small"
								sx={{
									height: 18,
									fontSize: '0.6rem',
									bgcolor: `#${label.color}22`,
									color: `#${label.color}`,
									border: 1,
									borderColor: `#${label.color}44`,
								}}
							/>
						))}
				</Box>

				{/* Stats row */}
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
					{totalChanges > 0 && (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
							<InsertDriveFileOutlinedIcon
								sx={{ fontSize: 13, color: 'text.disabled' }}
							/>
							<Typography
								variant="caption"
								sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
							>
								{pr.changed_files} file{pr.changed_files > 1 ? 's' : ''}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: 'success.main', fontSize: '0.7rem', ml: 0.5 }}
							>
								+{pr.additions}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: 'error.main', fontSize: '0.7rem' }}
							>
								-{pr.deletions}
							</Typography>
						</Box>
					)}
					{pr.comments + pr.review_comments > 0 && (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
							<ChatBubbleOutlineRoundedIcon
								sx={{ fontSize: 13, color: 'text.disabled' }}
							/>
							<Typography
								variant="caption"
								sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
							>
								{pr.comments + pr.review_comments}
							</Typography>
						</Box>
					)}
					{pr.requested_reviewers.length > 0 && (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
							{pr.requested_reviewers.slice(0, 3).map((r) => (
								<Tooltip key={r.login} title={r.login}>
									<Avatar src={r.avatar_url} sx={{ width: 18, height: 18 }} />
								</Tooltip>
							))}
						</Box>
					)}
				</Box>

				{/* Check runs detail */}
				<ChecksDetail runs={pr.check_runs} t={t} />
			</Box>

			{/* Right side */}
			<Box
				sx={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'flex-end',
					gap: 0.75,
					flexShrink: 0,
				}}
			>
				<Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
					{timeAgo(pr.updated_at)}
				</Typography>
				{canMerge && (
					<Button
						size="small"
						variant="contained"
						startIcon={<MergeTypeRoundedIcon sx={{ fontSize: 14 }} />}
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onMerge(pr);
						}}
						sx={{
							textTransform: 'none',
							fontSize: '0.7rem',
							fontWeight: 600,
							py: 0.25,
							px: 1.5,
							minHeight: 0,
							bgcolor: 'primary.main',
							'&:hover': { bgcolor: 'primary.dark' },
						}}
					>
						{t('merge')}
					</Button>
				)}
				<OpenInNewRoundedIcon
					className="open-icon"
					sx={{
						fontSize: 14,
						color: 'text.disabled',
						opacity: 0,
						transition: 'opacity 0.15s',
						cursor: 'pointer',
					}}
					onClick={() => window.open(pr.html_url, '_blank')}
				/>
			</Box>
		</Box>
	);
}

export default function PullRequestsList() {
	const theme = useTheme();
	const t = useTranslations('prs');
	const tc = useTranslations('common');
	const { views, reorderViews } = useAgentViews();
	const allRepos = useMemo(() => views.map((v) => v.repoFullName), [views]);
	const { data: allPrs, isLoading, refetch, isFetching } = usePullRequests(allRepos);
	const mergeMutation = useMergePR();
	const { showSnackbar } = useSnackbar();

	const [tabIndex, setTabIndex] = useState(0);
	const [mergeTarget, setMergeTarget] = useState<GitHubPullRequest | null>(null);

	const filteredPrs = useMemo(() => {
		if (!allPrs) return [];
		const repo = views[tabIndex]?.repoFullName;
		return repo
			? allPrs.filter((pr) => pr.repo_full_name?.toLowerCase() === repo.toLowerCase())
			: allPrs;
	}, [allPrs, tabIndex, views]);

	const handleMerge = useCallback(() => {
		if (!mergeTarget) return;
		mergeMutation.mutate(
			{ repo: mergeTarget.repo_full_name, pullNumber: mergeTarget.number },
			{
				onSuccess: () => {
					showSnackbar(t('mergeSuccess', { number: mergeTarget.number }), 'success');
					setMergeTarget(null);
				},
				onError: (err) => {
					showSnackbar(t('mergeError', { message: err.message }), 'error');
					setMergeTarget(null);
				},
			},
		);
	}, [mergeTarget, mergeMutation, showSnackbar, t]);

	// No views
	if (views.length === 0) {
		return (
			<Box sx={{ p: 4, maxWidth: 900, mx: 'auto' }}>
				<Typography
					variant="h4"
					sx={(theme) => ({
						fontWeight: 700,
						mb: 4,
						background: `linear-gradient(135deg, ${theme.palette.success.main} 0%, ${theme.palette.primary.main} 100%)`,
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					})}
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
						{t('noProjectSelected')}
					</Typography>
					<Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
						{t('addRepoFirst')}
					</Typography>
				</Box>
			</Box>
		);
	}

	return (
		<Box sx={{ p: 4, maxWidth: 900, mx: 'auto' }}>
			{/* Header */}
			<Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 3 }}>
				<Typography
					variant="h4"
					sx={(theme) => ({
						fontWeight: 700,
						background: `linear-gradient(135deg, ${theme.palette.success.main} 0%, ${theme.palette.primary.main} 100%)`,
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					})}
				>
					{t('title')}
				</Typography>
				<Tooltip title={tc('refresh')}>
					<IconButton
						size="small"
						onClick={() => refetch()}
						disabled={isFetching}
						sx={{
							ml: 'auto',
							color: 'text.disabled',
							'&:hover': { color: 'success.main' },
						}}
					>
						{isFetching ? (
							<CircularProgress size={16} sx={{ color: 'text.disabled' }} />
						) : (
							<RefreshRoundedIcon fontSize="small" />
						)}
					</IconButton>
				</Tooltip>
			</Box>

			{/* Tabs per repo */}
			<DraggableTabs
				tabs={views.map((v) => v.label)}
				activeTab={tabIndex}
				onTabChange={setTabIndex}
				onReorder={(newOrder) => {
					reorderViews(newOrder);
				}}
				color={theme.palette.success.main}
			/>

			{/* Loading */}
			{isLoading && (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
					<CircularProgress size={28} sx={{ color: 'success.main' }} />
				</Box>
			)}

			{/* Empty state */}
			{!isLoading && filteredPrs.length === 0 && (
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						py: 8,
						gap: 1.5,
					}}
				>
					<MergeTypeRoundedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
					<Typography variant="body1" color="text.secondary">
						{t('noOpenPRs')}
					</Typography>
				</Box>
			)}

			{/* PR list */}
			{!isLoading && filteredPrs.length > 0 && (
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					{filteredPrs.map((pr) => (
						<PRCard key={pr.id} pr={pr} onMerge={setMergeTarget} t={t} />
					))}
				</Box>
			)}

			{/* Merge confirmation dialog */}
			<Dialog
				open={!!mergeTarget}
				onClose={() => setMergeTarget(null)}
				maxWidth="xs"
				fullWidth
				PaperProps={{
					sx: {
						bgcolor: 'background.paper',
						borderRadius: 2,
						border: '1px solid',
						borderColor: 'divider',
					},
				}}
			>
				<DialogTitle sx={{ fontWeight: 600, fontSize: '1rem' }}>
					{t('squashAndMerge')}
				</DialogTitle>
				<DialogContent>
					{mergeTarget && (
						<Box>
							<Typography variant="body2" sx={{ mb: 1 }}>
								Merge <strong>#{mergeTarget.number}</strong> into{' '}
								<Chip
									label={mergeTarget.base.ref}
									size="small"
									sx={(theme) => ({
										height: 20,
										fontSize: '0.7rem',
										bgcolor: alpha(theme.palette.primary.main, 0.15),
										color: theme.palette.primary.main,
									})}
								/>
								?
							</Typography>
							<Typography
								variant="body2"
								sx={{ color: 'text.secondary', fontStyle: 'italic' }}
							>
								{mergeTarget.title}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: 'text.disabled', mt: 1, display: 'block' }}
							>
								{mergeTarget.head.ref} → {mergeTarget.base.ref} · squash merge
							</Typography>
						</Box>
					)}
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2 }}>
					<Button
						onClick={() => setMergeTarget(null)}
						sx={{ textTransform: 'none', color: 'text.secondary' }}
					>
						{tc('cancel')}
					</Button>
					<Button
						variant="contained"
						onClick={handleMerge}
						disabled={mergeMutation.isPending}
						startIcon={
							mergeMutation.isPending ? (
								<CircularProgress size={14} />
							) : (
								<MergeTypeRoundedIcon sx={{ fontSize: 16 }} />
							)
						}
						sx={{
							textTransform: 'none',
							fontWeight: 600,
							bgcolor: 'primary.main',
							'&:hover': { bgcolor: 'primary.dark' },
						}}
					>
						{mergeMutation.isPending ? t('merging') : t('confirmMerge')}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
