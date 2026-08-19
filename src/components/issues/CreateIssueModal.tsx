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
import Autocomplete from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { useTranslations } from 'next-intl';
import { useCreateIssue } from '@/hooks/useCreateIssue';
import { useGenerateIssue } from '@/hooks/useGenerateIssue';
import { useIssueCreateMeta } from '@/hooks/useIssueCreateMeta';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { GitHubLabel } from '@/types';

interface CreateIssueModalProps {
	open: boolean;
	onClose: () => void;
	repo: string | null;
	statusColumns: string[];
}

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
	const generateIssue = useGenerateIssue();
	const { labels, isLoading } = useIssueCreateMeta(repo, open);

	const [description, setDescription] = useState('');
	const [selectedLabels, setSelectedLabels] = useState<GitHubLabel[]>([]);
	// null = not chosen yet → falls back to the first status column (derived below).
	const [status, setStatus] = useState<string | null>(null);
	const statusValue = status ?? statusColumns[0] ?? NO_STATUS;

	const busy = generateIssue.isPending || createIssue.isPending;

	const resetForm = useCallback(() => {
		setDescription('');
		setSelectedLabels([]);
		setStatus(null);
	}, []);

	const handleClose = useCallback(() => {
		if (busy) return;
		resetForm();
		onClose();
	}, [busy, resetForm, onClose]);

	const handleCreate = useCallback(() => {
		if (!repo || !description.trim()) return;
		const [owner, name] = repo.split('/');
		generateIssue.mutate(
			{ description: description.trim(), repo },
			{
				onSuccess: (generated) => {
					createIssue.mutate(
						{
							owner,
							repo: name,
							title: generated.title.trim(),
							body: generated.body.trim() || undefined,
							labels: selectedLabels.map((l) => l.name),
							status: statusValue === NO_STATUS ? null : statusValue,
						},
						{
							onSuccess: (result) => {
								showSnackbar(
									t('issueCreated', { number: result.number }),
									'success',
								);
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
				},
				onError: (err) => {
					showSnackbar(err instanceof Error ? err.message : t('generateError'), 'error');
				},
			},
		);
	}, [
		repo,
		description,
		selectedLabels,
		statusValue,
		generateIssue,
		createIssue,
		showSnackbar,
		t,
		resetForm,
		onClose,
	]);

	const buttonLabel = generateIssue.isPending
		? t('generating')
		: createIssue.isPending
			? t('creating')
			: t('createIssue');

	const labelsField = (
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
	);

	const statusField = statusColumns.length > 0 && (
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
	);

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
					label={t('describeIssue')}
					placeholder={t('describeIssuePlaceholder')}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					size="small"
					fullWidth
					multiline
					minRows={4}
					sx={{ mt: 1 }}
				/>
				{labelsField}
				{statusField}
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={handleClose} disabled={busy} color="inherit">
					{t('cancel')}
				</Button>
				<Button
					onClick={handleCreate}
					disabled={!description.trim() || busy}
					variant="contained"
					startIcon={
						busy ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<AutoAwesomeRoundedIcon fontSize="small" />
						)
					}
				>
					{buttonLabel}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
