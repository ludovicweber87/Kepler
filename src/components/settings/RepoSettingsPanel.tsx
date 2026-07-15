'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { useTranslations } from 'next-intl';
import { useRepoSettings } from '@/hooks/useRepoSettings';
import { useSnackbar } from '@/hooks/useSnackbar';
import { DEFAULT_CREATE_PR_PROMPT } from '@/lib/prompts';

export default function RepoSettingsPanel({ repoFullName }: { repoFullName: string }) {
	const t = useTranslations('repoSettings');
	const { settings, save, isLoading, isSaving } = useRepoSettings(repoFullName);
	const { showSnackbar } = useSnackbar();

	const [prPrompt, setPrPrompt] = useState('');
	const [filesToCopy, setFilesToCopy] = useState('');
	const [setupScript, setSetupScript] = useState('');
	const [setupScriptName, setSetupScriptName] = useState('');
	const [archiveScript, setArchiveScript] = useState('');

	// Hydrate local state from server once loaded.
	useEffect(() => {
		if (isLoading) return;
		setPrPrompt(settings.create_pr_prompt);
		setFilesToCopy(settings.files_to_copy);
		setSetupScript(settings.setup_script);
		setSetupScriptName(settings.setup_script_name);
		setArchiveScript(settings.archive_script);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading, repoFullName]);

	const persist = async (patch: Parameters<typeof save>[0]) => {
		await save(patch);
		showSnackbar(t('saved'), 'success');
	};

	return (
		<Box
			sx={{
				p: 4,
				maxWidth: 800,
				mx: 'auto',
				display: 'flex',
				flexDirection: 'column',
				gap: 4,
			}}
		>
			<Typography variant="h4" sx={{ fontWeight: 700 }}>
				{t('title')} — {repoFullName}
			</Typography>

			{/* Create PR prompt */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
					{t('createPrPrompt')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
					{t('createPrPromptDesc')}
				</Typography>
				<TextField
					fullWidth
					multiline
					minRows={2}
					value={prPrompt}
					placeholder={DEFAULT_CREATE_PR_PROMPT}
					onChange={(e) => setPrPrompt(e.target.value)}
				/>
				<Button
					sx={{ mt: 1 }}
					variant="contained"
					disabled={isSaving}
					onClick={() => persist({ create_pr_prompt: prPrompt })}
				>
					{t('save')}
				</Button>
			</Box>

			{/* Files to copy */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
					{t('filesToCopy')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
					{t('filesToCopyDesc')}
				</Typography>
				<TextField
					fullWidth
					multiline
					minRows={3}
					value={filesToCopy}
					onChange={(e) => setFilesToCopy(e.target.value)}
					placeholder={'.env\n.env.local'}
				/>
				<Button
					sx={{ mt: 1 }}
					variant="contained"
					disabled={isSaving}
					onClick={() => persist({ files_to_copy: filesToCopy })}
				>
					{t('save')}
				</Button>
			</Box>

			{/* Setup script */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
					{t('setupScript')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
					{t('setupScriptDesc')}
				</Typography>
				<TextField
					fullWidth
					size="small"
					sx={{ mb: 1 }}
					label={t('setupScriptName')}
					helperText={t('setupScriptNameDesc')}
					value={setupScriptName}
					onChange={(e) => setSetupScriptName(e.target.value)}
					placeholder={t('setupScriptNamePlaceholder')}
				/>
				<TextField
					fullWidth
					multiline
					minRows={2}
					value={setupScript}
					onChange={(e) => setSetupScript(e.target.value)}
					placeholder="pnpm install"
				/>
				<Button
					sx={{ mt: 1 }}
					variant="contained"
					disabled={isSaving}
					onClick={() =>
						persist({ setup_script: setupScript, setup_script_name: setupScriptName })
					}
				>
					{t('save')}
				</Button>
			</Box>

			{/* Archive script */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
					{t('archiveScript')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
					{t('archiveScriptDesc')}
				</Typography>
				<TextField
					fullWidth
					multiline
					minRows={2}
					value={archiveScript}
					onChange={(e) => setArchiveScript(e.target.value)}
				/>
				<Button
					sx={{ mt: 1 }}
					variant="contained"
					disabled={isSaving}
					onClick={() => persist({ archive_script: archiveScript })}
				>
					{t('save')}
				</Button>
			</Box>

			<Typography variant="caption" sx={{ color: 'text.disabled' }}>
				{t('shareHint')}
			</Typography>
		</Box>
	);
}
