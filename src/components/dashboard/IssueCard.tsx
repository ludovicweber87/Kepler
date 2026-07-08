'use client';

import Link from 'next/link';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import { alpha, useTheme } from '@mui/material/styles';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CircleRoundedIcon from '@mui/icons-material/CircleRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded';
import { GitHubIssue } from '@/types';

function formatRelativeDate(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffHours < 1) return 'Just now';
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays === 1) return 'Yesterday';
	return `${diffDays}d ago`;
}

export default function IssueCard({ issue }: { issue: GitHubIssue }) {
	const theme = useTheme();
	const isOpen = issue.state === 'open';
	const stateColor = isOpen ? theme.palette.success.main : theme.palette.text.disabled;
	const stateLabel = isOpen ? 'Open' : 'Closed';
	const [owner, repo] = (issue.repo_full_name ?? '').split('/');
	const href = `/task/${owner}/${repo}/${issue.number}`;

	return (
		<Card
			sx={{
				...(isOpen ? {} : { opacity: 0.55 }),
				transition: 'transform 0.2s',
				'&:hover': { transform: 'translateY(-2px)' },
			}}
		>
			<Link href={href} style={{ textDecoration: 'none' }}>
				<CardActionArea>
					<CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
						<Box
							sx={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'flex-start',
								mb: 1.5,
							}}
						>
							<Box sx={{ flex: 1, mr: 2 }}>
								<Typography
									variant="subtitle1"
									sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.4 }}
								>
									{issue.title}
								</Typography>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
									<FolderOpenRoundedIcon
										sx={{ fontSize: 14, color: 'text.secondary' }}
									/>
									<Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
										{issue.repo_full_name}
									</Typography>
									<Typography
										variant="body2"
										sx={{ fontSize: '0.8rem', color: 'text.secondary' }}
									>
										#{issue.number}
									</Typography>
								</Box>
							</Box>
							{issue.assignee && (
								<Avatar
									src={issue.assignee.avatar_url}
									alt={issue.assignee.login}
									sx={{ width: 28, height: 28, flexShrink: 0 }}
								/>
							)}
						</Box>

						<Box
							sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
						>
							<Chip
								icon={
									isOpen ? (
										<CircleRoundedIcon sx={{ fontSize: '12px !important' }} />
									) : (
										<CheckCircleRoundedIcon
											sx={{ fontSize: '12px !important' }}
										/>
									)
								}
								label={stateLabel}
								size="small"
								sx={{
									bgcolor: alpha(stateColor, 0.12),
									color: stateColor,
									height: 26,
									'& .MuiChip-icon': { color: stateColor },
								}}
							/>
							{issue.project_columns?.map((pc) => (
								<Chip
									key={`${pc.project}-${pc.column}`}
									icon={
										<ViewColumnRoundedIcon
											sx={{ fontSize: '12px !important' }}
										/>
									}
									label={pc.column}
									size="small"
									sx={{
										height: 26,
										bgcolor: alpha(theme.palette.primary.light, 0.12),
										color: 'primary.light',
										'& .MuiChip-icon': { color: 'primary.light' },
									}}
								/>
							))}
							{issue.labels.slice(0, 3).map((label) => (
								<Chip
									key={label.name}
									label={label.name}
									size="small"
									sx={{
										height: 26,
										bgcolor: alpha(`#${label.color}`, 0.15),
										color: `#${label.color}`,
									}}
								/>
							))}
							<Box sx={{ flexGrow: 1 }} />
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
								<AccessTimeRoundedIcon
									sx={{ fontSize: 14, color: 'text.secondary' }}
								/>
								<Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
									{formatRelativeDate(issue.updated_at)}
								</Typography>
							</Box>
						</Box>
					</CardContent>
				</CardActionArea>
			</Link>
		</Card>
	);
}
