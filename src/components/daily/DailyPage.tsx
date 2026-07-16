'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { fr } from 'date-fns/locale';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useRecaps, useGenerateRecap, useDeleteRecap } from '@/hooks/useRecaps';
import { useSnackbar } from '@/hooks/useSnackbar';
import RecapCalendar from './RecapCalendar';
import ScheduleManager from './ScheduleManager';
import RecapDayModal from './RecapDayModal';

export default function DailyPage() {
	const t = useTranslations('daily');
	const { repoPaths } = useRepoPaths();
	const { showSnackbar } = useSnackbar();

	const [selectedRepo, setSelectedRepo] = useState<string>();
	const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
	const [selectedDate, setSelectedDate] = useState<Date | null>(null);
	const [modalOpen, setModalOpen] = useState(false);

	// Effective repo: user choice, else the first configured repo (no state-in-effect).
	const repo = selectedRepo ?? repoPaths[0]?.repo_full_name;

	const { data: recaps = [] } = useRecaps(repo, month);
	const generate = useGenerateRecap();
	const deleteRecap = useDeleteRecap();

	const recapDays = useMemo(() => new Set(recaps.map((r) => r.recap_date)), [recaps]);
	const selectedKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
	const recapsForDay = useMemo(
		() => recaps.filter((r) => r.recap_date === selectedKey),
		[recaps, selectedKey],
	);

	const runGenerate = (date: string) => {
		if (!repo) return;
		generate.mutate(
			{ repoFullName: repo, date },
			{
				onSuccess: () => showSnackbar(t('generatedSuccess'), 'success'),
				onError: (e) =>
					showSnackbar(e instanceof Error ? e.message : t('generateError'), 'error'),
			},
		);
	};

	const handleDelete = (id: string) => {
		if (!repo) return;
		deleteRecap.mutate(
			{ id, repoFullName: repo },
			{ onSuccess: () => showSnackbar(t('deletedSuccess'), 'success') },
		);
	};

	if (repoPaths.length === 0) {
		return (
			<Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
				<Typography variant="h6" sx={{ mb: 1 }}>
					{t('emptyTitle')}
				</Typography>
				<Typography variant="body2">{t('noRepoConfigured')}</Typography>
			</Box>
		);
	}

	return (
		<LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fr}>
			<Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
				<Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
					{t('title')}
				</Typography>

				<Paper
					variant="outlined"
					sx={{ p: 2, mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}
				>
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1.5,
							flexWrap: 'wrap',
						}}
					>
						<Select
							size="small"
							value={repo ?? ''}
							onChange={(e) => setSelectedRepo(e.target.value)}
							startAdornment={
								<FolderOpenRoundedIcon
									sx={{ fontSize: 16, mr: 0.75, color: 'text.secondary' }}
								/>
							}
							sx={{ minWidth: 220, fontSize: '0.85rem' }}
						>
							{repoPaths.map((r) => (
								<MenuItem key={r.repo_full_name} value={r.repo_full_name}>
									{r.repo_full_name}
								</MenuItem>
							))}
						</Select>

						<Button
							variant="contained"
							disabled={!repo || generate.isPending}
							onClick={() => runGenerate(format(new Date(), 'yyyy-MM-dd'))}
							startIcon={
								generate.isPending ? (
									<CircularProgress size={16} color="inherit" />
								) : (
									<AutoAwesomeRoundedIcon />
								)
							}
							sx={{ textTransform: 'none', fontWeight: 600 }}
						>
							{generate.isPending ? t('generating') : t('generateToday')}
						</Button>
					</Box>

					{repo && <ScheduleManager repo={repo} />}
				</Paper>

				<Box sx={{ display: 'flex', justifyContent: 'center' }}>
					<RecapCalendar
						recapDays={recapDays}
						onPickDay={(date) => {
							setSelectedDate(date);
							setModalOpen(true);
						}}
						onMonthChange={(date) => setMonth(format(date, 'yyyy-MM'))}
					/>
				</Box>

				<RecapDayModal
					open={modalOpen}
					onClose={() => setModalOpen(false)}
					date={selectedDate}
					recaps={recapsForDay}
					generating={generate.isPending}
					onGenerate={() => selectedKey && runGenerate(selectedKey)}
					onDelete={handleDelete}
				/>
			</Box>
		</LocalizationProvider>
	);
}
