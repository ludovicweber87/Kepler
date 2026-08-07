'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';
import { useLocale, useTranslations } from 'next-intl';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import type { AgentSession } from '@/hooks/useAgentSession';

interface ArchivedSessionCardProps {
	session: AgentSession;
	onOpen: () => void;
	onUnarchive: () => void;
	onDelete: (e: React.MouseEvent<HTMLElement>) => void;
}

export default function ArchivedSessionCard({
	session,
	onOpen,
	onUnarchive,
	onDelete,
}: ArchivedSessionCardProps) {
	const theme = useTheme();
	const locale = useLocale();
	const t = useTranslations('archived');

	const isError = session.status === 'error';
	const statusColor = isError ? theme.palette.error.main : theme.palette.success.main;
	const accent = session.agent_color ?? statusColor;

	const rawDate = session.archived_at ?? session.ended_at ?? session.started_at;
	const parsed = rawDate ? new Date(rawDate) : null;
	const dateLabel =
		parsed && !Number.isNaN(parsed.getTime())
			? parsed.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
			: null;
	const dateFull =
		parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString(locale) : undefined;

	const chipSx = {
		height: 19,
		fontSize: '0.62rem',
		fontWeight: 500,
		maxWidth: 240,
		'& .MuiChip-label': { px: 0.75 },
		'& .MuiChip-icon': { fontSize: '11px !important', ml: 0.5, mr: -0.25 },
	} as const;

	return (
		<Box
			onClick={onOpen}
			sx={{
				position: 'relative',
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
				pl: 2.25,
				pr: 1.5,
				py: 1.25,
				minHeight: 64,
				flexShrink: 0,
				overflow: 'hidden',
				border: 1,
				borderColor: 'divider',
				borderRadius: 2,
				bgcolor: 'background.paper',
				cursor: 'pointer',
				transition: 'border-color 0.15s, background-color 0.15s, transform 0.15s',
				'&:hover': {
					// Teinte primaire très légère : garde le contraste des chips et du texte
					// (l'ancien voile action.hover à 50 % délavait toutes les couleurs).
					bgcolor: alpha(
						theme.palette.primary.main,
						theme.palette.mode === 'dark' ? 0.07 : 0.04,
					),
					borderColor: alpha(theme.palette.primary.main, 0.35),
					transform: 'translateY(-1px)',
				},
				'&:hover .archived-card-actions': { opacity: 1 },
				'&:hover .archived-card-accent': { opacity: 1 },
			}}
		>
			{/* Barre d'accent (couleur du persona, fallback statut) */}
			<Box
				className="archived-card-accent"
				sx={{
					position: 'absolute',
					left: 0,
					top: 0,
					bottom: 0,
					width: 3,
					bgcolor: accent,
					opacity: 0.55,
					transition: 'opacity 0.15s',
				}}
			/>

			{/* Statut */}
			<Box
				sx={{
					width: 28,
					height: 28,
					borderRadius: 1.5,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexShrink: 0,
					bgcolor: alpha(statusColor, 0.12),
					border: `1px solid ${alpha(statusColor, 0.2)}`,
				}}
			>
				{isError ? (
					<ErrorOutlineRoundedIcon sx={{ fontSize: 16, color: 'error.main' }} />
				) : (
					<CheckCircleOutlineRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} />
				)}
			</Box>

			{/* Titre + métadonnées */}
			<Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
				<Typography
					sx={{
						fontSize: '0.85rem',
						fontWeight: 600,
						color: 'text.primary',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{session.agent_name ?? session.branch ?? 'Claude'}
				</Typography>

				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
					{session.branch && (
						<Chip
							icon={<AccountTreeRoundedIcon />}
							label={session.branch}
							size="small"
							sx={{
								...chipSx,
								bgcolor: alpha(theme.palette.secondary.main, 0.1),
								color: 'secondary.main',
								'& .MuiChip-icon': {
									...chipSx['& .MuiChip-icon'],
									color: 'inherit',
								},
							}}
						/>
					)}
					{session.project_name && (
						<Chip
							icon={<FolderOpenRoundedIcon />}
							label={session.project_name}
							size="small"
							sx={{
								...chipSx,
								bgcolor: alpha(theme.palette.text.primary, 0.06),
								color: 'text.secondary',
								'& .MuiChip-icon': {
									...chipSx['& .MuiChip-icon'],
									color: 'inherit',
								},
							}}
						/>
					)}
					{session.issue_number && (
						<Chip
							icon={<BugReportRoundedIcon />}
							label={`#${session.issue_number}`}
							size="small"
							sx={{
								...chipSx,
								bgcolor: alpha(theme.palette.warning.main, 0.1),
								color: 'warning.main',
								'& .MuiChip-icon': {
									...chipSx['& .MuiChip-icon'],
									color: 'inherit',
								},
							}}
						/>
					)}
				</Box>
			</Box>

			{/* Date */}
			{dateLabel && (
				<Tooltip title={t('archivedOn', { date: dateFull ?? dateLabel })} arrow>
					<Typography
						sx={{
							fontSize: '0.68rem',
							color: 'text.disabled',
							whiteSpace: 'nowrap',
							flexShrink: 0,
						}}
					>
						{dateLabel}
					</Typography>
				</Tooltip>
			)}

			{/* Actions (révélées au hover, place réservée pour éviter le saut de layout) */}
			<Box
				className="archived-card-actions"
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.25,
					flexShrink: 0,
					opacity: 0,
					transition: 'opacity 0.15s',
					'&:focus-within': { opacity: 1 },
				}}
			>
				<Tooltip title={t('unarchive')} arrow>
					<IconButton
						size="small"
						onClick={(e) => {
							e.stopPropagation();
							onUnarchive();
						}}
						sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
					>
						<UnarchiveOutlinedIcon sx={{ fontSize: 17 }} />
					</IconButton>
				</Tooltip>
				<Tooltip title={t('delete')} arrow>
					<IconButton
						size="small"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(e);
						}}
						sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
					>
						<DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
					</IconButton>
				</Tooltip>
			</Box>
		</Box>
	);
}
