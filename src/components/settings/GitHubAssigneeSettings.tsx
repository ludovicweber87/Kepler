'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import { useTranslations } from 'next-intl';
import { useAppSetting } from '@/hooks/useAppSetting';
import { useSnackbar } from '@/hooks/useSnackbar';
import { apiFetch } from '@/lib/api-fetch';

type Status = 'idle' | 'checking' | 'valid' | 'invalid';

export default function GitHubAssigneeSettings() {
	const t = useTranslations('settings');
	const tc = useTranslations('common');
	const { value, save, isSaving } = useAppSetting('github_default_assignee');
	const { showSnackbar } = useSnackbar();

	// `draft` prime sur la valeur DB dès que l'utilisateur tape (évite un effet d'init).
	const [draft, setDraft] = useState<string | null>(null);
	const input = draft ?? value ?? '';
	const trimmed = input.trim();

	const [status, setStatus] = useState<Status>('idle');
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

	// Validation debounced du login via l'API GitHub. Tous les setState sont
	// appelés dans le callback async (jamais synchronement dans le corps de l'effet).
	useEffect(() => {
		const login = trimmed;
		const ctrl = new AbortController();
		const id = setTimeout(
			() => {
				void (async () => {
					if (!login) {
						setStatus('idle');
						setAvatarUrl(null);
						return;
					}
					setStatus('checking');
					try {
						const res = await apiFetch(
							`/api/github/user?login=${encodeURIComponent(login)}`,
							{ signal: ctrl.signal },
						);
						if (res.ok) {
							const data = (await res.json()) as { avatar_url?: string };
							setAvatarUrl(data.avatar_url ?? null);
							setStatus('valid');
						} else {
							setAvatarUrl(null);
							setStatus('invalid');
						}
					} catch {
						if (!ctrl.signal.aborted) {
							setAvatarUrl(null);
							setStatus('invalid');
						}
					}
				})();
			},
			login ? 500 : 0,
		);
		return () => {
			clearTimeout(id);
			ctrl.abort();
		};
	}, [trimmed]);
	const canSave = !isSaving && (trimmed === '' || status === 'valid');

	const handleSave = async () => {
		await save(trimmed);
		showSnackbar(t('assigneeSaved'), 'success');
	};

	const adornment = (() => {
		if (!trimmed) return null;
		if (status === 'checking') return <CircularProgress size={16} />;
		if (status === 'valid')
			return avatarUrl ? (
				<Avatar src={avatarUrl} sx={{ width: 22, height: 22 }} />
			) : (
				<CheckCircleRoundedIcon sx={{ fontSize: 20, color: 'success.main' }} />
			);
		if (status === 'invalid')
			return <ErrorRoundedIcon sx={{ fontSize: 20, color: 'error.main' }} />;
		return null;
	})();

	return (
		<Box>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				{t('githubUserDesc')}
			</Typography>
			<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
				<TextField
					size="small"
					label={t('assigneeLabel')}
					placeholder="octocat"
					value={input}
					onChange={(e) => setDraft(e.target.value)}
					error={status === 'invalid'}
					helperText={status === 'invalid' ? t('assigneeInvalid') : t('assigneeHelp')}
					sx={{ minWidth: 280 }}
					slotProps={{
						input: {
							startAdornment: <InputAdornment position="start">@</InputAdornment>,
							endAdornment: adornment ? (
								<InputAdornment position="end">{adornment}</InputAdornment>
							) : undefined,
						},
					}}
				/>
				<Button
					variant="contained"
					onClick={() => void handleSave()}
					disabled={!canSave}
					sx={{ textTransform: 'none', fontWeight: 600, mt: 0.25 }}
				>
					{tc('save')}
				</Button>
			</Box>
		</Box>
	);
}
