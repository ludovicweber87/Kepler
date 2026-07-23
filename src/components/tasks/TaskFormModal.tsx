'use client';

import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format, parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import type { Task, NewTask, TaskPatch } from '@/types';
import UrgencyChip from './UrgencyChip';
import IssueSelect, { type IssueRef } from './IssueSelect';

interface Props {
	open: boolean;
	task: Task | null; // null → création
	now: Date;
	onClose: () => void;
	onCreate: (input: NewTask) => Promise<Task>;
	onUpdate: (patch: TaskPatch) => Promise<Task>;
	onDelete: (id: string) => void;
}

export default function TaskFormModal({
	open,
	task,
	now,
	onClose,
	onCreate,
	onUpdate,
	onDelete,
}: Props) {
	const t = useTranslations('tasks');
	const { repoPaths } = useRepoPaths();

	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [dueDate, setDueDate] = useState<Date | null>(null);
	const [repo, setRepo] = useState('');
	const [issue, setIssue] = useState<IssueRef | null>(null);
	const [pinned, setPinned] = useState(false);
	const [saving, setSaving] = useState(false);

	// Réinitialise le formulaire à chaque ouverture / changement de task.
	useEffect(() => {
		if (!open) return;
		setTitle(task?.title ?? '');
		setDescription(task?.description ?? '');
		setDueDate(task?.due_date ? parseISO(task.due_date) : null);
		setRepo(task?.repo_full_name ?? '');
		setIssue(
			task?.issue_owner && task.issue_repo && task.issue_number
				? {
						owner: task.issue_owner,
						repo: task.issue_repo,
						number: task.issue_number,
						title: task.issue_title ?? '',
					}
				: null,
		);
		setPinned(task?.pinned ?? false);
	}, [open, task]);

	const dueDateStr = dueDate ? format(dueDate, 'yyyy-MM-dd') : null;

	const handleSave = async () => {
		const trimmed = title.trim();
		if (!trimmed) return;
		setSaving(true);
		const payload = {
			title: trimmed,
			description: description.trim() || null,
			due_date: dueDateStr,
			repo_full_name: repo || null,
			issue_owner: issue?.owner ?? null,
			issue_repo: issue?.repo ?? null,
			issue_number: issue?.number ?? null,
			issue_title: issue?.title ?? null,
			pinned,
		};
		try {
			if (task) await onUpdate({ id: task.id, ...payload });
			else await onCreate(payload);
			onClose();
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
			<DialogTitle sx={{ fontSize: '1.05rem', fontWeight: 700 }}>
				{task ? t('editTitle') : t('newTitle')}
			</DialogTitle>
			<DialogContent>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
					<TextField
						autoFocus
						fullWidth
						size="small"
						label={t('fieldTitle')}
						required
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && title.trim() && !saving) {
								e.preventDefault();
								void handleSave();
							}
						}}
					/>
					<TextField
						fullWidth
						size="small"
						label={t('fieldDescription')}
						multiline
						minRows={2}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
					<Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
						<Box sx={{ flex: 1, minWidth: 180 }}>
							<DatePicker
								label={t('fieldDueDate')}
								value={dueDate}
								onChange={(d) => setDueDate(d)}
								slotProps={{
									textField: { size: 'small', fullWidth: true },
									field: { clearable: true },
								}}
							/>
							{dueDateStr && (
								<Box sx={{ mt: 1 }}>
									<UrgencyChip dueDate={dueDateStr} now={now} />
								</Box>
							)}
						</Box>
						<FormControl size="small" sx={{ flex: 1, minWidth: 180 }}>
							<InputLabel>{t('fieldRepo')}</InputLabel>
							<Select
								label={t('fieldRepo')}
								value={repo}
								onChange={(e) => setRepo(e.target.value)}
							>
								<MenuItem value="">
									<em>{t('noRepo')}</em>
								</MenuItem>
								{repoPaths.map((r) => (
									<MenuItem key={r.repo_full_name} value={r.repo_full_name}>
										{r.repo_full_name}
									</MenuItem>
								))}
							</Select>
						</FormControl>
					</Box>
					<IssueSelect value={issue} onChange={setIssue} />
					<FormControlLabel
						control={
							<Switch
								checked={pinned}
								onChange={(e) => setPinned(e.target.checked)}
							/>
						}
						label={t('fieldPinned')}
					/>
				</Box>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
				<Box>
					{task && (
						<Button
							color="error"
							startIcon={<DeleteOutlineRoundedIcon />}
							onClick={() => {
								onDelete(task.id);
								onClose();
							}}
							sx={{ textTransform: 'none' }}
						>
							{t('delete')}
						</Button>
					)}
				</Box>
				<Box sx={{ display: 'flex', gap: 1 }}>
					<Button onClick={onClose} sx={{ textTransform: 'none' }}>
						{t('cancel')}
					</Button>
					<Button
						variant="contained"
						onClick={() => void handleSave()}
						disabled={!title.trim() || saving}
						sx={{ textTransform: 'none', fontWeight: 600 }}
					>
						{task ? t('save') : t('create')}
					</Button>
				</Box>
			</DialogActions>
		</Dialog>
	);
}
