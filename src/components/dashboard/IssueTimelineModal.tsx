'use client';

import { useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ChatBubbleRoundedIcon from '@mui/icons-material/ChatBubbleRounded';
import LabelRoundedIcon from '@mui/icons-material/LabelRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CircleRoundedIcon from '@mui/icons-material/CircleRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import { useIssueTimeline } from '@/hooks/useGitHub';
import { GitHubTimelineEvent } from '@/types';

interface IssueTimelineModalProps {
	open: boolean;
	onClose: () => void;
	owner: string;
	repo: string;
	number: string;
	issueTitle: string;
}

function formatRelativeDate(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return 'just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 30) return `${diffDays}d ago`;
	return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface EventConfig {
	icon: React.ReactNode;
	color: string;
	text: React.ReactNode;
}

function getEventConfig(event: GitHubTimelineEvent, theme: Theme): EventConfig | null {
	switch (event.event) {
		case 'commented': {
			const e = event as GitHubTimelineEvent & {
				event: 'commented';
				body: string;
				user: { login: string };
			};
			const preview = e.body.length > 120 ? e.body.slice(0, 120) + '…' : e.body;
			return {
				icon: <ChatBubbleRoundedIcon sx={{ fontSize: 16 }} />,
				color: theme.palette.info.main,
				text: (
					<Box>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{e.user?.login ?? e.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							commented
						</Typography>
						<Typography
							variant="body2"
							sx={{
								mt: 0.5,
								color: 'text.secondary',
								fontSize: '0.8rem',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								maxWidth: 500,
								display: 'block',
							}}
						>
							{preview.replace(/\n/g, ' ')}
						</Typography>
					</Box>
				),
			};
		}
		case 'labeled': {
			const e = event as GitHubTimelineEvent & {
				event: 'labeled';
				label: { name: string; color: string };
			};
			return {
				icon: <LabelRoundedIcon sx={{ fontSize: 16 }} />,
				color: `#${e.label.color}`,
				text: (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{e.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							added
						</Typography>
						<Chip
							label={e.label.name}
							size="small"
							sx={{
								height: 20,
								fontSize: '0.7rem',
								bgcolor: alpha(`#${e.label.color}`, 0.15),
								color: `#${e.label.color}`,
							}}
						/>
					</Box>
				),
			};
		}
		case 'unlabeled': {
			const e = event as GitHubTimelineEvent & {
				event: 'unlabeled';
				label: { name: string; color: string };
			};
			return {
				icon: <LabelRoundedIcon sx={{ fontSize: 16 }} />,
				color: theme.palette.text.disabled,
				text: (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{e.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							removed
						</Typography>
						<Chip
							label={e.label.name}
							size="small"
							sx={{
								height: 20,
								fontSize: '0.7rem',
								bgcolor: alpha(`#${e.label.color}`, 0.15),
								color: `#${e.label.color}`,
							}}
						/>
					</Box>
				),
			};
		}
		case 'assigned': {
			const e = event as GitHubTimelineEvent & {
				event: 'assigned';
				assignee: { login: string };
			};
			return {
				icon: <PersonRoundedIcon sx={{ fontSize: 16 }} />,
				color: theme.palette.success.main,
				text: (
					<>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{e.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							assigned{' '}
						</Typography>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{e.assignee.login}
						</Typography>
					</>
				),
			};
		}
		case 'unassigned': {
			const e = event as GitHubTimelineEvent & {
				event: 'unassigned';
				assignee: { login: string };
			};
			return {
				icon: <PersonRoundedIcon sx={{ fontSize: 16 }} />,
				color: theme.palette.text.disabled,
				text: (
					<>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{e.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							unassigned{' '}
						</Typography>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{e.assignee.login}
						</Typography>
					</>
				),
			};
		}
		case 'closed': {
			const e = event as GitHubTimelineEvent & {
				event: 'closed';
				state_reason?: string | null;
			};
			const reason = e.state_reason === 'completed' ? ' as completed' : '';
			return {
				icon: <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />,
				color: theme.palette.primary.main,
				text: (
					<>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{e.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							closed{reason}
						</Typography>
					</>
				),
			};
		}
		case 'reopened':
			return {
				icon: <CircleRoundedIcon sx={{ fontSize: 16 }} />,
				color: theme.palette.success.main,
				text: (
					<>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{event.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							reopened
						</Typography>
					</>
				),
			};
		case 'renamed': {
			const e = event as GitHubTimelineEvent & {
				event: 'renamed';
				rename: { from: string; to: string };
			};
			return {
				icon: <EditRoundedIcon sx={{ fontSize: 16 }} />,
				color: theme.palette.warning.main,
				text: (
					<Box>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{e.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							renamed
						</Typography>
						<Typography
							variant="body2"
							sx={{
								mt: 0.5,
								color: 'text.secondary',
								fontSize: '0.8rem',
								display: 'block',
							}}
						>
							<Box
								component="span"
								sx={{ textDecoration: 'line-through', opacity: 0.6 }}
							>
								{e.rename.from}
							</Box>
							{' → '}
							{e.rename.to}
						</Typography>
					</Box>
				),
			};
		}
		case 'cross-referenced':
		case 'referenced':
			return {
				icon: <LinkRoundedIcon sx={{ fontSize: 16 }} />,
				color: theme.palette.text.disabled,
				text: (
					<>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{event.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							referenced this
							{(
								event as GitHubTimelineEvent & {
									source?: {
										issue?: {
											number: number;
											repository?: { full_name: string };
										};
									};
								}
							).source?.issue
								? ` in ${(event as GitHubTimelineEvent & { source: { issue: { repository?: { full_name: string }; number: number } } }).source.issue.repository?.full_name ?? ''}#${(event as GitHubTimelineEvent & { source: { issue: { number: number } } }).source.issue.number}`
								: ''}
						</Typography>
					</>
				),
			};
		default:
			if (!event.event) return null;
			return {
				icon: <EventNoteRoundedIcon sx={{ fontSize: 16 }} />,
				color: theme.palette.text.disabled,
				text: (
					<>
						<Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
							{event.actor?.login ?? 'someone'}
						</Typography>
						<Typography variant="body2" component="span">
							{' '}
							{event.event.replace(/_/g, ' ')}
						</Typography>
					</>
				),
			};
	}
}

function TimelineItem({ event, isLast }: { event: GitHubTimelineEvent; isLast: boolean }) {
	const theme = useTheme();
	const config = getEventConfig(event, theme);
	if (!config) return null;

	return (
		<Box sx={{ display: 'flex', gap: 2, position: 'relative', minHeight: 40 }}>
			{/* Vertical line */}
			{!isLast && (
				<Box
					sx={{
						position: 'absolute',
						left: 15,
						top: 32,
						bottom: -8,
						width: 2,
						bgcolor: 'divider',
					}}
				/>
			)}
			{/* Icon circle */}
			<Box
				sx={{
					width: 32,
					height: 32,
					borderRadius: '50%',
					bgcolor: alpha(config.color, 0.12),
					color: config.color,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexShrink: 0,
					zIndex: 1,
				}}
			>
				{config.icon}
			</Box>
			{/* Content */}
			<Box sx={{ flex: 1, pt: 0.5, pb: 2 }}>
				<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
					{event.actor?.avatar_url && (
						<Avatar
							src={event.actor.avatar_url}
							alt={event.actor.login}
							sx={{ width: 20, height: 20, mt: 0.2 }}
						/>
					)}
					<Box sx={{ flex: 1 }}>{config.text}</Box>
					{event.created_at && (
						<Typography
							variant="caption"
							sx={{
								color: 'text.secondary',
								whiteSpace: 'nowrap',
								flexShrink: 0,
								mt: 0.2,
							}}
						>
							{formatRelativeDate(event.created_at)}
						</Typography>
					)}
				</Box>
			</Box>
		</Box>
	);
}

function LoadingSkeleton() {
	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
			{Array.from({ length: 6 }).map((_, i) => (
				<Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
					<Skeleton variant="circular" width={32} height={32} />
					<Box sx={{ flex: 1 }}>
						<Skeleton variant="text" width="60%" height={20} />
						<Skeleton variant="text" width="30%" height={16} />
					</Box>
				</Box>
			))}
		</Box>
	);
}

export default function IssueTimelineModal({
	open,
	onClose,
	owner,
	repo,
	number,
	issueTitle,
}: IssueTimelineModalProps) {
	const { data: events, isLoading, refetch } = useIssueTimeline(owner, repo, number);

	useEffect(() => {
		if (open) refetch();
	}, [open, refetch]);

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="sm"
			fullWidth
			PaperProps={{
				sx: {
					bgcolor: 'background.paper',
					backgroundImage: 'none',
					borderRadius: 1,
					maxHeight: '80vh',
				},
			}}
		>
			<DialogTitle
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1.5,
					pr: 6,
					pb: 1,
				}}
			>
				<HistoryRoundedIcon sx={{ color: 'primary.main' }} />
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
						Timeline — #{number}
					</Typography>
					<Typography
						variant="body2"
						sx={{
							color: 'text.secondary',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{issueTitle}
					</Typography>
				</Box>
				<IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}>
					<CloseRoundedIcon />
				</IconButton>
			</DialogTitle>
			<DialogContent sx={{ px: 3, pb: 3 }}>
				{isLoading ? (
					<LoadingSkeleton />
				) : events && events.length > 0 ? (
					<Box sx={{ pt: 1 }}>
						{events.map((event, index) => (
							<TimelineItem
								key={event.id ?? `${event.event}-${index}`}
								event={event}
								isLast={index === events.length - 1}
							/>
						))}
					</Box>
				) : (
					<Typography
						variant="body2"
						sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}
					>
						No timeline events found.
					</Typography>
				)}
			</DialogContent>
		</Dialog>
	);
}
