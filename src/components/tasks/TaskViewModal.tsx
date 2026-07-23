'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import GitHubIcon from '@mui/icons-material/GitHub';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import { alpha } from '@mui/material/styles';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCreateIssue } from '@/hooks/useCreateIssue';
import { useTasks } from '@/hooks/useTasks';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { Task } from '@/types';
import UrgencyChip from './UrgencyChip';

interface Props {
	open: boolean;
	task: Task | null;
	now: Date;
	onClose: () => void;
	onEdit: (task: Task) => void;
}

export default function TaskViewModal({ open, task, now, onClose, onEdit }: Props) {
	const t = useTranslations('tasks');
	const router = useRouter();
	const { repoPaths } = useRepoPaths();
	const { updateTask } = useTasks();
	const createIssue = useCreateIssue();
	const { showSnackbar } = useSnackbar();

	const [repoChoice, setRepoChoice] = useState('');

	const hasIssue = !!(task?.issue_owner && task?.issue_repo && task?.issue_number);
	const effectiveRepo = task?.repo_full_name || repoChoice;
	const noReposConfigured = !task?.repo_full_name && repoPaths.length === 0;
	const canCreate = !!task && !hasIssue && !!effectiveRepo && !createIssue.isPending;

	const handleCreate = async () => {
		if (!task || !effectiveRepo) return;
		const [owner, repo] = effectiveRepo.split('/');
		try {
			const result = await createIssue.mutateAsync({
				owner,
				repo,
				title: task.title,
				body: task.description ?? '',
			});
			await updateTask({
				id: task.id,
				issue_owner: owner,
				issue_repo: repo,
				issue_number: result.number,
				issue_title: task.title,
			});
			showSnackbar(t('issueCreated', { number: result.number }), 'success');
			onClose();
		} catch {
			showSnackbar(t('issueCreateError'), 'error');
		}
	};

	return (
		<Dialog open={open && !!task} onClose={onClose} maxWidth="sm" fullWidth>
			{task && (
				<>
					<DialogTitle sx={{ fontSize: '1.05rem', fontWeight: 700, pr: 6 }}>
						{task.title}
					</DialogTitle>
					<DialogContent>
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
							{/* Chips méta */}
							<Box
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 1,
									flexWrap: 'wrap',
								}}
							>
								<UrgencyChip dueDate={task.due_date} done={task.done} now={now} />
								{task.repo_full_name && (
									<Chip
										icon={<FolderOpenRoundedIcon sx={{ fontSize: 14 }} />}
										label={task.repo_full_name}
										size="small"
										variant="outlined"
										sx={{ fontSize: '0.7rem' }}
									/>
								)}
								{hasIssue && (
									<Chip
										label={`#${task.issue_number}`}
										size="small"
										clickable
										onClick={() =>
											router.push(
												`/task/${task.issue_owner}/${task.issue_repo}/${task.issue_number}`,
											)
										}
										sx={{
											height: 22,
											fontSize: '0.7rem',
											fontWeight: 600,
											color: 'primary.light',
											bgcolor: (theme) =>
												alpha(theme.palette.primary.main, 0.18),
										}}
									/>
								)}
							</Box>

							{/* Description */}
							<Typography
								variant="body2"
								sx={{
									whiteSpace: 'pre-wrap',
									color: task.description ? 'text.primary' : 'text.disabled',
								}}
							>
								{task.description || t('noDescription')}
							</Typography>

							{/* Sélecteur de repo pour créer l'issue (si la tâche n'a pas de repo) */}
							{!hasIssue && !task.repo_full_name && repoPaths.length > 0 && (
								<FormControl size="small" fullWidth>
									<InputLabel>{t('createIssueRepoLabel')}</InputLabel>
									<Select
										label={t('createIssueRepoLabel')}
										value={repoChoice}
										onChange={(e) => setRepoChoice(e.target.value)}
									>
										{repoPaths.map((r) => (
											<MenuItem
												key={r.repo_full_name}
												value={r.repo_full_name}
											>
												{r.repo_full_name}
											</MenuItem>
										))}
									</Select>
								</FormControl>
							)}
							{!hasIssue && noReposConfigured && (
								<Typography variant="caption" color="text.secondary">
									{t('createIssueNoRepo')}
								</Typography>
							)}
						</Box>
					</DialogContent>
					<DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
						<Box>
							{!hasIssue && (
								<Button
									startIcon={<GitHubIcon />}
									onClick={() => void handleCreate()}
									disabled={!canCreate}
									sx={{ textTransform: 'none' }}
								>
									{t('createIssue')}
								</Button>
							)}
						</Box>
						<Box sx={{ display: 'flex', gap: 1 }}>
							<Button onClick={onClose} sx={{ textTransform: 'none' }}>
								{t('close')}
							</Button>
							<Button
								variant="contained"
								startIcon={<EditRoundedIcon />}
								onClick={() => onEdit(task)}
								sx={{ textTransform: 'none', fontWeight: 600 }}
							>
								{t('edit')}
							</Button>
						</Box>
					</DialogActions>
				</>
			)}
		</Dialog>
	);
}
