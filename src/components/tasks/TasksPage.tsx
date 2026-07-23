'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { enUS, fr, es, de, pt } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { useTasks } from '@/hooks/useTasks';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { partitionTasks } from '@/lib/taskSort';
import type { Task } from '@/types';
import TaskRow from './TaskRow';
import TaskFormModal from './TaskFormModal';
import TaskViewModal from './TaskViewModal';

const DATE_LOCALES = { en: enUS, fr, es, de, pt } as const;

export default function TasksPage() {
	const t = useTranslations('tasks');
	const locale = useLocale();
	const { tasks, isLoading, createTask, updateTask, deleteTask, toggleDone, togglePinned } =
		useTasks();
	const { repoPaths } = useRepoPaths();

	const [repoFilter, setRepoFilter] = useState('all');
	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<Task | null>(null);
	const [viewTask, setViewTask] = useState<Task | null>(null);

	// Stable pour toute la durée de vie de la page (cohérence du tri/urgence).
	const now = useMemo(() => new Date(), []);

	const filtered = useMemo(
		() => (repoFilter === 'all' ? tasks : tasks.filter((t) => t.repo_full_name === repoFilter)),
		[tasks, repoFilter],
	);
	const { pinned, active, done } = useMemo(() => partitionTasks(filtered, now), [filtered, now]);

	const openCreate = () => {
		setEditing(null);
		setModalOpen(true);
	};
	const openEdit = (task: Task) => {
		setEditing(task);
		setModalOpen(true);
	};

	const rowProps = {
		now,
		onOpen: setViewTask,
		onToggleDone: toggleDone,
		onTogglePin: togglePinned,
		onDelete: deleteTask,
	};

	const renderSection = (label: string, items: Task[]) =>
		items.length > 0 && (
			<Box sx={{ mb: 2.5 }}>
				<Typography
					variant="caption"
					sx={{
						display: 'block',
						px: 1,
						mb: 0.75,
						color: 'text.disabled',
						fontWeight: 700,
						textTransform: 'uppercase',
						letterSpacing: 0.8,
					}}
				>
					{label} · {items.length}
				</Typography>
				{items.map((task) => (
					<TaskRow key={task.id} task={task} {...rowProps} />
				))}
			</Box>
		);

	const isEmpty = !isLoading && tasks.length === 0;

	return (
		<LocalizationProvider
			dateAdapter={AdapterDateFns}
			adapterLocale={DATE_LOCALES[locale as keyof typeof DATE_LOCALES] ?? enUS}
		>
			<Box sx={{ maxWidth: 900, mx: 'auto' }}>
				<Box
					sx={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: 2,
						mb: 3,
						flexWrap: 'wrap',
					}}
				>
					<Typography variant="h4" sx={{ fontWeight: 700 }}>
						{t('title')}
					</Typography>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
						<Select
							size="small"
							value={repoFilter}
							onChange={(e) => setRepoFilter(e.target.value)}
							startAdornment={
								<FolderOpenRoundedIcon
									sx={{ fontSize: 16, mr: 0.75, color: 'text.secondary' }}
								/>
							}
							sx={{ minWidth: 200, fontSize: '0.85rem' }}
						>
							<MenuItem value="all">{t('allRepos')}</MenuItem>
							{repoPaths.map((r) => (
								<MenuItem key={r.repo_full_name} value={r.repo_full_name}>
									{r.repo_full_name}
								</MenuItem>
							))}
						</Select>
						<Button
							variant="contained"
							startIcon={<AddRoundedIcon />}
							onClick={openCreate}
							sx={{ textTransform: 'none', fontWeight: 600 }}
						>
							{t('newTask')}
						</Button>
					</Box>
				</Box>

				{isLoading ? (
					<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
						<CircularProgress />
					</Box>
				) : isEmpty ? (
					<Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
						<ChecklistRoundedIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
						<Typography variant="h6" sx={{ mb: 0.5 }}>
							{t('emptyTitle')}
						</Typography>
						<Typography variant="body2">{t('emptyHint')}</Typography>
					</Box>
				) : (
					<>
						{renderSection(t('sectionPinned'), pinned)}
						{renderSection(t('sectionActive'), active)}
						{renderSection(t('sectionDone'), done)}
					</>
				)}

				<TaskViewModal
					key={viewTask?.id ?? 'none'}
					open={!!viewTask}
					task={viewTask}
					now={now}
					onClose={() => setViewTask(null)}
					onEdit={(task) => {
						setViewTask(null);
						openEdit(task);
					}}
				/>

				<TaskFormModal
					open={modalOpen}
					task={editing}
					now={now}
					onClose={() => setModalOpen(false)}
					onCreate={createTask}
					onUpdate={updateTask}
					onDelete={deleteTask}
				/>
			</Box>
		</LocalizationProvider>
	);
}
