'use client';

import { useState, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import Autocomplete from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslations } from 'next-intl';
import { useCreateIssue } from '@/hooks/useCreateIssue';
import { useIssueCreateMeta } from '@/hooks/useIssueCreateMeta';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { GitHubLabel } from '@/types';

interface CreateIssueModalProps {
	open: boolean;
	onClose: () => void;
	repo: string | null;
	statusColumns: string[];
}

const NO_MILESTONE = '';
const NO_STATUS = '__none__';

export default function CreateIssueModal({
	open,
	onClose,
	repo,
	statusColumns,
}: CreateIssueModalProps) {
	const t = useTranslations('issues');
	const { showSnackbar } = useSnackbar();
	const createIssue = useCreateIssue();
	const { labels, milestones, assignees, isLoading } = useIssueCreateMeta(repo, open);

	const [title, setTitle] = useState('');
	const [body, setBody] = useState('');
	const [selectedLabels, setSelectedLabels] = useState<GitHubLabel[]>([]);
	const [selectedAssignees, setSelectedAssignees] = useState<
		{ login: string; avatar_url: string }[]
	>([]);
	const [milestone, setMilestone] = useState<string>(NO_MILESTONE);
	// null = not chosen yet → falls back to the first status column (derived below).
	const [status, setStatus] = useState<string | null>(null);
	const statusValue = status ?? statusColumns[0] ?? NO_STATUS;

	const resetForm = useCallback(() => {
		setTitle('');
		setBody('');
		setSelectedLabels([]);
		setSelectedAssignees([]);
		setMilestone(NO_MILESTONE);
		setStatus(null);
	}, []);

	const handleClose = useCallback(() => {
		if (createIssue.isPending) return;
		onClose();
	}, [createIssue.isPending, onClose]);

	const handleSubmit = useCallback(() => {
		if (!repo || !title.trim()) return;
		const [owner, name] = repo.split('/');
		createIssue.mutate(
			{
				owner,
				repo: name,
				title: title.trim(),
				body: body.trim() || undefined,
				labels: selectedLabels.map((l) => l.name),
				assignees: selectedAssignees.map((a) => a.login),
				milestone: milestone ? Number(milestone) : null,
				status: statusValue === NO_STATUS ? null : statusValue,
			},
			{
				onSuccess: (result) => {
					showSnackbar(t('issueCreated', { number: result.number }), 'success');
					if (result.boardWarning) {
						showSnackbar(t('boardAddWarning'), 'warning');
					}
					resetForm();
					onClose();
				},
				onError: (err) => {
					showSnackbar(
						err instanceof Error ? err.message : t('issueCreateError'),
						'error',
					);
				},
			},
		);
	}, [
		repo,
		title,
		body,
		selectedLabels,
		selectedAssignees,
		milestone,
		statusValue,
		createIssue,
		showSnackbar,
		t,
		resetForm,
		onClose,
	]);

	return (
		<Dialog
			open={open}
			onClose={handleClose}
			maxWidth="sm"
			fullWidth
			PaperProps={{ sx: { borderRadius: 1 } }}
		>
			<DialogTitle sx={{ fontWeight: 700 }}>{t('newIssue')}</DialogTitle>
			<DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
				<TextField
					autoFocus
					required
					label={t('issueTitle')}
					placeholder={t('issueTitlePlaceholder')}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					size="small"
					fullWidth
					sx={{ mt: 1 }}
				/>
				<TextField
					label={t('issueBody')}
					placeholder={t('issueBodyPlaceholder')}
					value={body}
					onChange={(e) => setBody(e.target.value)}
					size="small"
					fullWidth
					multiline
					minRows={4}
				/>
				<Autocomplete
					multiple
					size="small"
					options={labels}
					loading={isLoading}
					value={selectedLabels}
					onChange={(_, v) => setSelectedLabels(v)}
					getOptionLabel={(o) => o.name}
					isOptionEqualToValue={(a, b) => a.name === b.name}
					renderOption={(props, option) => (
						<Box component="li" {...props} sx={{ display: 'flex', gap: 1 }}>
							<Box
								sx={{
									width: 12,
									height: 12,
									borderRadius: '50%',
									bgcolor: `#${option.color}`,
									flexShrink: 0,
								}}
							/>
							{option.name}
						</Box>
					)}
					renderTags={(value, getTagProps) =>
						value.map((option, index) => {
							const { key, ...chipProps } = getTagProps({ index });
							return (
								<Chip
									key={key}
									{...chipProps}
									size="small"
									label={option.name}
									sx={{
										bgcolor: `#${option.color}22`,
										borderColor: `#${option.color}`,
									}}
									variant="outlined"
								/>
							);
						})
					}
					renderInput={(params) => <TextField {...params} label={t('labels')} />}
				/>
				<Autocomplete
					multiple
					size="small"
					options={assignees}
					loading={isLoading}
					value={selectedAssignees}
					onChange={(_, v) => setSelectedAssignees(v)}
					getOptionLabel={(o) => o.login}
					isOptionEqualToValue={(a, b) => a.login === b.login}
					renderOption={(props, option) => (
						<Box component="li" {...props} sx={{ display: 'flex', gap: 1 }}>
							<Avatar src={option.avatar_url} sx={{ width: 20, height: 20 }} />
							{option.login}
						</Box>
					)}
					renderInput={(params) => <TextField {...params} label={t('assignees')} />}
				/>
				<TextField
					select
					size="small"
					label={t('milestone')}
					value={milestone}
					onChange={(e) => setMilestone(e.target.value)}
					fullWidth
				>
					<MenuItem value={NO_MILESTONE}>{t('noMilestone')}</MenuItem>
					{milestones.map((m) => (
						<MenuItem key={m.number} value={String(m.number)}>
							{m.title}
						</MenuItem>
					))}
				</TextField>
				{statusColumns.length > 0 && (
					<TextField
						select
						size="small"
						label={t('initialStatus')}
						value={statusValue}
						onChange={(e) => setStatus(e.target.value)}
						fullWidth
					>
						<MenuItem value={NO_STATUS}>{t('noStatus')}</MenuItem>
						{statusColumns.map((col) => (
							<MenuItem key={col} value={col}>
								{col}
							</MenuItem>
						))}
					</TextField>
				)}
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={handleClose} disabled={createIssue.isPending} color="inherit">
					{t('cancel')}
				</Button>
				<Button
					onClick={handleSubmit}
					disabled={!title.trim() || createIssue.isPending}
					variant="contained"
					startIcon={
						createIssue.isPending ? (
							<CircularProgress size={16} color="inherit" />
						) : null
					}
				>
					{createIssue.isPending ? t('creating') : t('create')}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
