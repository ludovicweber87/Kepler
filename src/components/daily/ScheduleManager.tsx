'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useRecapSchedules } from '@/hooks/useRecaps';

export default function ScheduleManager({ repo }: { repo: string }) {
	const t = useTranslations('daily');
	const { schedules, addSchedule, removeSchedule } = useRecapSchedules(repo);
	const [pending, setPending] = useState<Date | null>(null);

	const handleAdd = () => {
		if (!pending) return;
		addSchedule(format(pending, 'HH:mm'));
		setPending(null);
	};

	return (
		<Box>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
				<ScheduleRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
				<Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
					{t('schedules')}
				</Typography>
			</Box>

			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
				<TimePicker
					ampm={false}
					value={pending}
					onChange={setPending}
					slotProps={{ textField: { size: 'small', sx: { width: 130 } } }}
				/>
				<Tooltip title={t('addSchedule')}>
					<span>
						<IconButton
							size="small"
							color="primary"
							disabled={!pending}
							onClick={handleAdd}
						>
							<AddRoundedIcon fontSize="small" />
						</IconButton>
					</span>
				</Tooltip>
			</Box>

			{schedules.length === 0 ? (
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{t('noSchedules')}
				</Typography>
			) : (
				<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
					{schedules.map((s) => (
						<Chip
							key={s.id}
							label={s.time}
							size="small"
							icon={<ScheduleRoundedIcon sx={{ fontSize: 14 }} />}
							onDelete={() => removeSchedule(s.id)}
							sx={{ fontSize: '0.75rem' }}
						/>
					))}
				</Box>
			)}
		</Box>
	);
}
