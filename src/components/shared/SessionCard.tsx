'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { alpha, useTheme } from '@mui/material/styles';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import QuestionAnswerRoundedIcon from '@mui/icons-material/QuestionAnswerRounded';

export interface SessionCardProps {
	/** Display name (agent name or branch) */
	name: string;
	/** Secondary info (path or project name) */
	subtitle?: string;
	/** Branch chip — shown only if provided and different from name */
	branch?: string;
	/** Session status */
	status: 'active' | 'completed' | 'error' | 'idle';
	/** Active session is currently streaming output */
	isStreaming?: boolean;
	/** Date label (e.g. "il y a 5 min", "12 mars") */
	date?: string;
	onClick: () => void;
	/** Stop/kill action (active sessions) */
	onStop?: () => void;
	/** Delete action (past sessions) — receives the click event for popover anchoring */
	onDelete?: (e: React.MouseEvent) => void;
	/** Agent is waiting for an answer */
	hasPendingQuestion?: boolean;
	/** Compact layout for tight spaces (e.g. sidebar) */
	compact?: boolean;
}

export default function SessionCard({
	name,
	subtitle,
	branch,
	status,
	isStreaming = false,
	hasPendingQuestion = false,
	date,
	onClick,
	onStop,
	onDelete,
	compact = false,
}: SessionCardProps) {
	const theme = useTheme();
	const t = useTranslations('sessionCard');
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

	const isActive = status === 'active';
	const isFinished = status === 'completed' || status === 'error';
	const isError = status === 'error';
	const isIdle = status === 'idle';

	// Colors
	const activeColor = theme.palette.success.main;
	const errorColor = theme.palette.error.main;
	const finishedColor = theme.palette.text.secondary;
	const idleColor = theme.palette.primary.main;
	const questionColor = theme.palette.warning.main;

	const statusColor = isActive
		? activeColor
		: isError
			? errorColor
			: isFinished
				? finishedColor
				: idleColor;

	const borderColor = isActive
		? alpha(activeColor, isStreaming ? 0.25 : 0.1)
		: isFinished
			? alpha(statusColor, 0.15)
			: 'divider';

	const bgColor = isActive
		? alpha(activeColor, isStreaming ? 0.08 : 0.04)
		: isFinished
			? alpha(statusColor, 0.04)
			: 'background.paper';

	const p = compact ? 1.5 : 2;
	const nameFontSize = compact ? '0.75rem' : '0.85rem';
	const subtitleFontSize = compact ? '0.6rem' : '0.72rem';
	const chipHeight = compact ? 18 : 20;
	const chipFontSize = compact ? '0.6rem' : '0.65rem';
	const iconSize = compact ? 14 : 16;

	const hasMenu = !!onStop || !!onDelete;

	return (
		<Box
			onClick={onClick}
			sx={{
				p,
				borderRadius: 1,
				bgcolor: bgColor,
				border: 1,
				borderColor,
				borderLeft: isActive && isStreaming ? 3 : 1,
				borderLeftColor: isActive && isStreaming ? activeColor : borderColor,
				cursor: 'pointer',
				transition: 'all 0.15s',
				opacity: isFinished ? 0.6 : 1,
				'&:hover': {
					bgcolor: isActive
						? alpha(activeColor, 0.12)
						: isFinished
							? alpha(statusColor, 0.08)
							: 'action.hover',
					borderColor: isActive
						? alpha(activeColor, 0.3)
						: isFinished
							? alpha(statusColor, 0.25)
							: 'action.disabled',
					transform: compact ? 'translateX(-2px)' : 'translateX(2px)',
					opacity: isFinished ? 0.8 : 1,
				},
			}}
		>
			{/* Row 1: Status + Name + Actions */}
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: subtitle ? 0.5 : 0 }}>
				{/* Status indicator */}
				{isActive ? (
					<FiberManualRecordRoundedIcon
						sx={{
							fontSize: compact ? 8 : 10,
							color: isStreaming ? theme.palette.success.main : finishedColor,
							...(isStreaming && {
								animation: 'sessionCardPulse 2s ease-in-out infinite',
								'@keyframes sessionCardPulse': {
									'0%, 100%': { opacity: 0.4 },
									'50%': { opacity: 1 },
								},
							}),
						}}
					/>
				) : isFinished ? (
					isError ? (
						<ErrorOutlineRoundedIcon sx={{ fontSize: iconSize, color: errorColor }} />
					) : (
						<CheckCircleOutlineRoundedIcon sx={{ fontSize: iconSize, color: finishedColor }} />
					)
				) : (
					<AccountTreeRoundedIcon sx={{ fontSize: iconSize, color: idleColor }} />
				)}

				{/* Name */}
				<Typography
					variant="body2"
					sx={{
						fontWeight: isActive ? 700 : 600,
						fontSize: nameFontSize,
						flex: 1,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						color: isFinished ? 'text.secondary' : 'text.primary',
					}}
				>
					{name}
				</Typography>

				{/* Streaming dots */}
				{isStreaming && (
					<Box sx={{ display: 'flex', gap: 0.4, alignItems: 'center' }}>
						{[0, 1, 2].map((i) => (
							<Box
								key={i}
								sx={{
									width: 4,
									height: 4,
									borderRadius: '50%',
									bgcolor: 'primary.main',
									animation: 'sessionCardDotPulse 1.4s ease-in-out infinite',
									animationDelay: `${i * 0.2}s`,
									'@keyframes sessionCardDotPulse': {
										'0%, 80%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
										'40%': { opacity: 1, transform: 'scale(1)' },
									},
								}}
							/>
						))}
					</Box>
				)}

				{/* Status chips */}
				{isActive && (
					<Chip
						label={t('active')}
						size="small"
						sx={{
							height: chipHeight,
							fontSize: chipFontSize,
							fontWeight: 600,
							bgcolor: alpha(activeColor, 0.12),
							color: activeColor,
							border: `1px solid ${alpha(activeColor, 0.2)}`,
						}}
					/>
				)}
				{isFinished && !isError && (
					<Chip
						label={t('completed')}
						size="small"
						sx={{
							height: chipHeight,
							fontSize: chipFontSize,
							fontWeight: 600,
							bgcolor: alpha(finishedColor, 0.12),
							color: finishedColor,
							border: `1px solid ${alpha(finishedColor, 0.2)}`,
						}}
					/>
				)}
				{isError && (
					<Chip
						label={t('error')}
						size="small"
						sx={{
							height: chipHeight,
							fontSize: chipFontSize,
							fontWeight: 600,
							bgcolor: alpha(errorColor, 0.12),
							color: errorColor,
							border: `1px solid ${alpha(errorColor, 0.2)}`,
						}}
					/>
				)}

				{/* Pending question chip */}
				{hasPendingQuestion && (
					<Chip
						icon={<QuestionAnswerRoundedIcon sx={{ fontSize: `${compact ? 11 : 12}px !important` }} />}
						label={t('question')}
						size="small"
						sx={{
							height: chipHeight,
							fontSize: chipFontSize,
							fontWeight: 600,
							bgcolor: alpha(questionColor, 0.12),
							color: questionColor,
							border: `1px solid ${alpha(questionColor, 0.2)}`,
							'& .MuiChip-icon': { color: questionColor },
							animation: 'sessionCardQuestionPulse 2s ease-in-out infinite',
							'@keyframes sessionCardQuestionPulse': {
								'0%, 100%': { opacity: 0.7 },
								'50%': { opacity: 1 },
							},
						}}
					/>
				)}

				{/* Branch chip */}
				{branch && branch !== name && (
					<Chip
						icon={<AccountTreeRoundedIcon sx={{ fontSize: `${compact ? 11 : 12}px !important` }} />}
						label={branch}
						size="small"
						sx={{
							height: chipHeight,
							fontSize: chipFontSize,
							bgcolor: (t: { palette: { secondary: { main: string } } }) =>
								alpha(t.palette.secondary.main, 0.08),
							color: 'secondary.main',
							border: (t: { palette: { secondary: { main: string } } }) =>
								`1px solid ${alpha(t.palette.secondary.main, 0.2)}`,
							'& .MuiChip-icon': { color: 'secondary.main' },
						}}
					/>
				)}

				{/* Date */}
				{date && (
					<Typography
						variant="caption"
						sx={{
							color: 'text.disabled',
							fontSize: compact ? '0.6rem' : '0.7rem',
							fontFamily: isActive ? 'monospace' : undefined,
							whiteSpace: 'nowrap',
						}}
					>
						{date}
					</Typography>
				)}

				{/* Context menu */}
				{hasMenu && (
					<>
						<IconButton
							size="small"
							onClick={(e) => {
								e.stopPropagation();
								setAnchorEl(e.currentTarget);
							}}
							sx={{
								p: 0.25,
								color: 'text.disabled',
								'&:hover': { color: 'text.secondary' },
							}}
						>
							<MoreVertRoundedIcon sx={{ fontSize: compact ? 14 : 16 }} />
						</IconButton>
						<Menu
							anchorEl={anchorEl}
							open={Boolean(anchorEl)}
							onClose={(e: React.SyntheticEvent) => {
								e.stopPropagation?.();
								setAnchorEl(null);
							}}
							onClick={(e) => e.stopPropagation()}
							slotProps={{
								paper: {
									sx: {
										bgcolor: 'background.paper',
										border: 1,
										borderColor: 'divider',
										minWidth: 160,
									},
								},
							}}
						>
							{onStop && (
								<MenuItem
									onClick={(e) => {
										e.stopPropagation();
										setAnchorEl(null);
										onStop();
									}}
									sx={{ fontSize: '0.8rem', gap: 1 }}
								>
									<ListItemIcon sx={{ minWidth: '28px !important' }}>
										<StopCircleRoundedIcon sx={{ fontSize: 18, color: 'error.main' }} />
									</ListItemIcon>
									<ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
										{t('closeSession')}
									</ListItemText>
								</MenuItem>
							)}
							{onDelete && (
								<MenuItem
									onClick={(e) => {
										e.stopPropagation();
										setAnchorEl(null);
										onDelete(e);
									}}
									sx={{ fontSize: '0.8rem', gap: 1 }}
								>
									<ListItemIcon sx={{ minWidth: '28px !important' }}>
										<DeleteOutlineRoundedIcon sx={{ fontSize: 18, color: 'error.main' }} />
									</ListItemIcon>
									<ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
										{t('delete')}
									</ListItemText>
								</MenuItem>
							)}
						</Menu>
					</>
				)}

			</Box>

			{/* Row 2: Subtitle (path/project) */}
			{subtitle && (
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<FolderRoundedIcon sx={{ fontSize: compact ? 11 : 13, color: 'text.disabled' }} />
					<Typography
						variant="caption"
						sx={{
							color: isFinished ? 'text.disabled' : 'text.secondary',
							fontSize: subtitleFontSize,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
							flex: 1,
						}}
					>
						{subtitle}
					</Typography>
				</Box>
			)}
		</Box>
	);
}
