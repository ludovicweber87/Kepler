'use client';

import { useState, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import Chip from '@mui/material/Chip';
import { useTranslations } from 'next-intl';
import { localFetch } from '@/lib/local-fetch';
import type { GitHubIssue } from '@/types';

interface CreateBranchModalProps {
	open: boolean;
	onClose: () => void;
	issue: GitHubIssue;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.slice(0, 50)
		.replace(/-$/, '');
}

export default function CreateBranchModal({ open, onClose, issue }: CreateBranchModalProps) {
	const t = useTranslations('issues');
	const tc = useTranslations('common');
	const defaultBranch = useMemo(() => `feat/${slugify(issue.title)}`, [issue.title]);

	const [branchName, setBranchName] = useState(defaultBranch);
	const [status, setStatus] = useState<Status>('idle');
	const [errorMsg, setErrorMsg] = useState('');
	const [toast, setToast] = useState(false);

	const handleCreate = async () => {
		setStatus('loading');
		setErrorMsg('');

		try {
			const res = await localFetch('/git/branch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					repoFullName: issue.repo_full_name,
					branchName: branchName.trim(),
					issueNumber: issue.number,
				}),
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to create branch');
			}

			setStatus('success');
			setToast(true);
			setTimeout(() => {
				onClose();
			}, 1500);
		} catch (err) {
			setStatus('error');
			setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
		}
	};

	const handleClose = () => {
		if (status === 'loading') return;
		setBranchName(defaultBranch);
		setStatus('idle');
		setErrorMsg('');
		onClose();
	};

	return (
		<>
			<Dialog
				open={open}
				onClose={handleClose}
				maxWidth="sm"
				fullWidth
				PaperProps={{ sx: { borderRadius: 1 } }}
			>
				<DialogTitle sx={{ fontWeight: 600 }}>{t('createBranch')}</DialogTitle>
				<DialogContent>
					<Box sx={{ mb: 2.5 }}>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
							{t('issue')}
						</Typography>
						<Typography variant="body1" sx={{ fontWeight: 500 }}>
							#{issue.number} {issue.title}
						</Typography>
					</Box>

					{issue.repo_full_name && (
						<Box sx={{ mb: 2.5 }}>
							<Chip
								label={issue.repo_full_name}
								size="small"
								variant="outlined"
								sx={{ fontSize: '0.75rem' }}
							/>
						</Box>
					)}

					<TextField
						label={t('branchName')}
						fullWidth
						size="small"
						value={branchName}
						onChange={(e) => setBranchName(e.target.value)}
						disabled={status === 'loading' || status === 'success'}
						sx={{ mb: 1 }}
					/>

					<Typography variant="caption" color="text.secondary">
						{t('willExecute')} {branchName}
					</Typography>

					{status === 'error' && (
						<Alert severity="error" sx={{ mt: 2, borderRadius: 1 }}>
							{errorMsg}
						</Alert>
					)}
				</DialogContent>

				<DialogActions sx={{ px: 3, pb: 2.5 }}>
					<Button onClick={handleClose} disabled={status === 'loading'}>
						{tc('cancel')}
					</Button>
					<Button
						variant="contained"
						onClick={handleCreate}
						disabled={
							!branchName.trim() || status === 'loading' || status === 'success'
						}
						startIcon={
							status === 'loading' ? <CircularProgress size={16} /> : undefined
						}
					>
						{status === 'loading'
							? t('creating')
							: status === 'success'
								? t('created')
								: t('createBranch')}
					</Button>
				</DialogActions>
			</Dialog>

			<Snackbar
				open={toast}
				autoHideDuration={3000}
				onClose={() => setToast(false)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
			>
				<Alert onClose={() => setToast(false)} severity="success" variant="filled">
					{t('branchCreated', { branchName })}
				</Alert>
			</Snackbar>
		</>
	);
}
