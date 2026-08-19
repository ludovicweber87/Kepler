'use client';

import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import { useTranslations } from 'next-intl';

export const REFETCH_INTERVALS = [0, 60_000, 300_000, 600_000, 3_600_000, 86_400_000] as const;

export default function RefetchIntervalSelect({
	value,
	onChange,
}: {
	value: number;
	onChange: (ms: number) => void;
}) {
	const t = useTranslations('common');

	const labelFor = (ms: number): string => {
		switch (ms) {
			case 60_000:
				return t('refresh1min');
			case 300_000:
				return t('refresh5min');
			case 600_000:
				return t('refresh10min');
			case 3_600_000:
				return t('refresh1h');
			case 86_400_000:
				return t('refresh24h');
			default:
				return t('refreshManual');
		}
	};

	return (
		<Tooltip title={t('autoRefresh')}>
			<Select
				size="small"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				renderValue={(v) => (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
						<AutorenewRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
						<span>{labelFor(Number(v))}</span>
					</Box>
				)}
				sx={{
					fontSize: '0.82rem',
					bgcolor: 'background.paper',
					'& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
					'& .MuiSelect-select': {
						py: 0.75,
						pl: 1,
						display: 'flex',
						alignItems: 'center',
					},
				}}
			>
				{REFETCH_INTERVALS.map((ms) => (
					<MenuItem key={ms} value={ms} sx={{ fontSize: '0.82rem' }}>
						{labelFor(ms)}
					</MenuItem>
				))}
			</Select>
		</Tooltip>
	);
}
