'use client';

import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { computeUrgency } from '@/lib/taskUrgency';

interface Props {
	dueDate: string | null;
	now: Date;
	/** Une task terminée n'affiche jamais de pastille. */
	done?: boolean;
}

export default function UrgencyChip({ dueDate, now, done = false }: Props) {
	const theme = useTheme();
	const t = useTranslations('tasks');

	// Task terminée ou sans échéance → pas de pastille (task de fond neutre).
	if (done) return null;
	const { level, daysRemaining } = computeUrgency(dueDate, now);
	if (level === 'none' || daysRemaining === null) return null;

	const colorByLevel = {
		green: theme.palette.success.main,
		orange: theme.palette.warning.main,
		red: theme.palette.error.main,
		overdue: theme.palette.error.main,
	} as const;
	const color = colorByLevel[level];

	// Libellé court (dans la pastille).
	let label: string;
	if (level === 'overdue') label = t('chipOverdue', { days: Math.abs(daysRemaining) });
	else if (daysRemaining === 0) label = t('chipToday');
	else if (daysRemaining === 1) label = t('chipTomorrow');
	else label = t('chipInDays', { days: daysRemaining });

	// Tooltip (temps restant détaillé).
	let tooltip: string;
	if (level === 'overdue') tooltip = t('tooltipOverdue', { days: Math.abs(daysRemaining) });
	else if (daysRemaining === 0) tooltip = t('tooltipToday');
	else tooltip = t('tooltipInDays', { days: daysRemaining });

	const isOverdue = level === 'overdue';

	return (
		<Tooltip title={tooltip}>
			<Chip
				label={label}
				size="small"
				sx={{
					height: 20,
					fontSize: '0.65rem',
					fontWeight: 600,
					color: isOverdue ? theme.palette.common.white : color,
					bgcolor: isOverdue ? color : alpha(color, 0.2),
					'& .MuiChip-label': { px: 1 },
					...(isOverdue && {
						animation: 'taskPulse 1.6s ease-in-out infinite',
						'@keyframes taskPulse': {
							'0%, 100%': { opacity: 1 },
							'50%': { opacity: 0.55 },
						},
					}),
				}}
			/>
		</Tooltip>
	);
}
