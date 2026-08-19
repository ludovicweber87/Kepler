'use client';

import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { useTranslations } from 'next-intl';
import type { DocStatus } from '@/types';

const CONFIG: Record<DocStatus, { color: string; bg: string }> = {
	queued: { color: '#fbbf24', bg: 'rgba(245,158,11,0.14)' },
	generating: { color: '#38d6ff', bg: 'rgba(0,212,255,0.14)' },
	ready: { color: '#4ade80', bg: 'rgba(34,197,94,0.15)' },
	failed: { color: '#f87171', bg: 'rgba(239,68,68,0.15)' },
};

export default function DocStatusBadge({ status }: { status: DocStatus }) {
	const t = useTranslations('docs');
	const cfg = CONFIG[status];

	const icon =
		status === 'generating' ? (
			<CircularProgress size={11} sx={{ color: cfg.color }} />
		) : status === 'ready' ? (
			<CheckCircleRoundedIcon sx={{ fontSize: 13 }} />
		) : status === 'failed' ? (
			<ErrorOutlineRoundedIcon sx={{ fontSize: 13 }} />
		) : (
			<ScheduleRoundedIcon sx={{ fontSize: 13 }} />
		);

	return (
		<Chip
			icon={icon}
			label={t(`status.${status}`)}
			size="small"
			sx={{
				height: 22,
				fontSize: '0.7rem',
				fontWeight: 600,
				color: cfg.color,
				bgcolor: cfg.bg,
				'& .MuiChip-icon': { color: cfg.color, ml: '6px' },
			}}
		/>
	);
}
