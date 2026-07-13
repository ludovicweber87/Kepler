'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useTranslations } from 'next-intl';
import { useRepoSettings } from '@/hooks/useRepoSettings';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { RunScript } from '@/types';
import { DEFAULT_CREATE_PR_PROMPT } from '@/lib/prompts';

export default function RepoSettingsPanel({ repoFullName }: { repoFullName: string }) {
	const t = useTranslations('repoSettings');
	const { settings, save, isLoading, isSaving } = useRepoSettings(repoFullName);
	const { showSnackbar } = useSnackbar();

	const [prPrompt, setPrPrompt] = useState('');
	const [filesToCopy, setFilesToCopy] = useState('');
	const [setupScript, setSetupScript] = useState('');
	const [archiveScript, setArchiveScript] = useState('');
	const [runScripts, setRunScripts] = useState<RunScript[]>([]);

	// Hydrate local state from server once loaded.
	useEffect(() => {
		if (isLoading) return;
		setPrPrompt(settings.create_pr_prompt);
		setFilesToCopy(settings.files_to_copy);
		setSetupScript(settings.setup_script);
		setArchiveScript(settings.archive_script);
		setRunScripts(settings.run_scripts);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading, repoFullName]);

	const persist = async (patch: Parameters<typeof save>[0]) => {
		await save(patch);
		showSnackbar(t('saved'), 'success');
	};

	const addRunScript = () =>
		setRunScripts((s) => [...s, { id: crypto.randomUUID(), name: '', command: '' }]);
	const updateRunScript = (id: string, field: 'name' | 'command', value: string) =>
		setRunScripts((s) => s.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
	const deleteRunScript = (id: string) => setRunScripts((s) => s.filter((r) => r.id !== id));

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
					onClick={() => persist({ setup_script: setupScript })}
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

			{/* Run scripts */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
					{t('runScripts')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
					{t('runScriptsDesc')}
				</Typography>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					{runScripts.map((rs) => (
						<Box key={rs.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
							<TextField
								size="small"
								sx={{ width: 180 }}
								placeholder={t('runScriptName')}
								value={rs.name}
								onChange={(e) => updateRunScript(rs.id, 'name', e.target.value)}
							/>
							<TextField
								size="small"
								fullWidth
								placeholder={t('runScriptCommand')}
								value={rs.command}
								onChange={(e) => updateRunScript(rs.id, 'command', e.target.value)}
							/>
							<IconButton size="small" onClick={() => deleteRunScript(rs.id)}>
								<DeleteOutlineRoundedIcon fontSize="small" />
							</IconButton>
						</Box>
					))}
				</Box>
				<Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
					<Button startIcon={<AddRoundedIcon />} onClick={addRunScript}>
						{t('addRunScript')}
					</Button>
					<Button
						variant="contained"
						disabled={isSaving}
						onClick={() => persist({ run_scripts: runScripts })}
					>
						{t('save')}
					</Button>
				</Box>
			</Box>

			<Typography variant="caption" sx={{ color: 'text.disabled' }}>
				{t('shareHint')}
			</Typography>
		</Box>
	);
}
