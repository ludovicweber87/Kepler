'use client';

import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import { alpha } from '@mui/material/styles';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Task } from '@/types';
import UrgencyChip from './UrgencyChip';

interface Props {
	task: Task;
	now: Date;
	onEdit: (task: Task) => void;
	onToggleDone: (task: Task) => void;
	onTogglePin: (task: Task) => void;
	onDelete: (id: string) => void;
}

export default function TaskRow({ task, now, onEdit, onToggleDone, onTogglePin, onDelete }: Props) {
	const router = useRouter();
	const t = useTranslations('tasks');

	const hasIssue = !!(task.issue_owner && task.issue_repo && task.issue_number);

	return (
		<Box
			onClick={() => onEdit(task)}
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1,
				px: 1,
				py: 0.75,
				borderRadius: 1.5,
				bgcolor: 'background.paper',
				mb: 0.5,
				cursor: 'pointer',
				opacity: task.done ? 0.5 : 1,
				transition: 'background-color 0.15s',
				'&:hover': { bgcolor: 'action.hover' },
				'&:hover .task-actions': { opacity: 1 },
			}}
		>
			<Checkbox
				size="small"
				checked={task.done}
				onClick={(e) => e.stopPropagation()}
				onChange={() => onToggleDone(task)}
				sx={{ p: 0.25 }}
			/>

			{task.pinned && (
				<PushPinRoundedIcon sx={{ fontSize: 14, color: 'warning.main', flexShrink: 0 }} />
			)}

			<Typography
				sx={{
					flex: 1,
					minWidth: 0,
					fontSize: '0.85rem',
					whiteSpace: 'nowrap',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					textDecoration: task.done ? 'line-through' : 'none',
					color: task.done ? 'text.disabled' : 'text.primary',
				}}
			>
				{task.title}
			</Typography>

			{task.repo_full_name && (
				<Tooltip title={task.repo_full_name}>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 0.25,
							color: 'secondary.main',
							fontSize: '0.7rem',
							flexShrink: 0,
							maxWidth: 140,
						}}
					>
						<FolderOpenRoundedIcon sx={{ fontSize: 13 }} />
						<Box
							component="span"
							sx={{
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}
						>
							{task.repo_full_name.split('/').pop()}
						</Box>
					</Box>
				</Tooltip>
			)}

			{hasIssue && (
				<Chip
					label={`#${task.issue_number}`}
					size="small"
					clickable
					onClick={(e) => {
						e.stopPropagation();
						router.push(
							`/task/${task.issue_owner}/${task.issue_repo}/${task.issue_number}`,
						);
					}}
					sx={{
						height: 20,
						fontSize: '0.65rem',
						fontWeight: 600,
						color: 'primary.light',
						bgcolor: (theme) => alpha(theme.palette.primary.main, 0.18),
						flexShrink: 0,
						'& .MuiChip-label': { px: 1 },
					}}
				/>
			)}

			<UrgencyChip dueDate={task.due_date} done={task.done} now={now} />

			<Box
				className="task-actions"
				sx={{ display: 'flex', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
			>
				<Tooltip title={task.pinned ? t('unpin') : t('pin')}>
					<IconButton
						size="small"
						onClick={(e) => {
							e.stopPropagation();
							onTogglePin(task);
						}}
						sx={{ p: 0.25, color: task.pinned ? 'warning.main' : 'text.disabled' }}
					>
						{task.pinned ? (
							<PushPinRoundedIcon sx={{ fontSize: 15 }} />
						) : (
							<PushPinOutlinedIcon sx={{ fontSize: 15 }} />
						)}
					</IconButton>
				</Tooltip>
				<Tooltip title={t('delete')}>
					<IconButton
						size="small"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(task.id);
						}}
						sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'error.main' } }}
					>
						<DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} />
					</IconButton>
				</Tooltip>
			</Box>
		</Box>
	);
}
