'use client';

import { useRouter } from 'next/navigation';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { alpha } from '@mui/material/styles';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import { useTranslations } from 'next-intl';
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

interface IssueCardProps {
	issue: GitHubIssue;
	currentColumn: string;
	columns: string[];
	onStatusChange?: (issue: GitHubIssue, newStatus: string) => void;
}

export default function IssueCard({
	issue,
	currentColumn,
	columns,
	onStatusChange,
}: IssueCardProps) {
	const router = useRouter();
	const t = useTranslations('issues');
	const [owner, repo] = (issue.repo_full_name ?? '').split('/');
	const href = `/task/${owner}/${repo}/${issue.number}`;

	const handleStatusChange = (event: SelectChangeEvent<string>) => {
		event.stopPropagation();
		const newStatus = event.target.value;
		if (newStatus !== currentColumn) {
			onStatusChange?.(issue, newStatus);
		}
	};

	return (
		<Card
			onClick={() => router.push(href)}
			sx={{
				cursor: 'pointer',
				borderRadius: 1,
				transition: 'transform 0.15s, box-shadow 0.15s',
				'&:hover': { transform: 'translateY(-1px)', boxShadow: 4 },
			}}
		>
			<CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
				<Box
					sx={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'flex-start',
						mb: 0.75,
					}}
				>
					<Typography
						variant="body2"
						sx={{ fontWeight: 600, lineHeight: 1.35, flex: 1, mr: 1 }}
					>
						{issue.title}
					</Typography>
					{issue.assignee && (
						<Avatar
							src={issue.assignee.avatar_url}
							alt={issue.assignee.login}
							sx={{ width: 24, height: 24, flexShrink: 0 }}
						/>
					)}
				</Box>

				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
					<FolderOpenRoundedIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
					<Typography variant="caption" sx={{ color: 'text.secondary' }}>
						{repo}
					</Typography>
					<Typography variant="caption" sx={{ color: 'text.disabled' }}>
						#{issue.number}
					</Typography>
				</Box>

				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
					{issue.labels.slice(0, 2).map((label) => (
						<Chip
							key={label.name}
							label={label.name}
							size="small"
							sx={{
								height: 20,
								fontSize: '0.675rem',
								bgcolor: alpha(`#${label.color}`, 0.15),
								color: `#${label.color}`,
							}}
						/>
					))}
					<Box sx={{ flexGrow: 1 }} />
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
						<AccessTimeRoundedIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
						<Typography
							variant="caption"
							sx={{ fontSize: '0.675rem', color: 'text.disabled' }}
						>
							{formatRelativeDate(issue.updated_at)}
						</Typography>
					</Box>
				</Box>

				{columns.length > 0 && (
					<Select
						size="small"
						value={currentColumn}
						onChange={handleStatusChange}
						onClick={(e) => e.stopPropagation()}
						sx={{
							mt: 1,
							width: '100%',
							height: 28,
							fontSize: '0.75rem',
							borderRadius: 1,
							'& .MuiOutlinedInput-notchedOutline': {
								borderColor: 'divider',
							},
							'& .MuiSelect-select': {
								py: 0.5,
								px: 1,
							},
						}}
						renderValue={(value) => (
							<Typography variant="caption" sx={{ fontWeight: 500 }}>
								{t('moveTo')}: {value}
							</Typography>
						)}
					>
						{columns.map((col) => (
							<MenuItem
								key={col}
								value={col}
								disabled={col === currentColumn}
								sx={{ fontSize: '0.8rem' }}
							>
								{col}
							</MenuItem>
						))}
					</Select>
				)}
			</CardContent>
		</Card>
	);
}
