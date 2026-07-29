'use client';

import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import { useTranslations } from 'next-intl';
import { useRepoSettings } from '@/hooks/useRepoSettings';
import RepoScriptsEditor from '@/components/settings/RepoScriptsEditor';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { resolveConfigForRepo } from '@/lib/repoIssueBoard';
import { useSnackbar } from '@/hooks/useSnackbar';
import { DEFAULT_CREATE_PR_PROMPT, DEFAULT_COMMIT_PUSH_PROMPT } from '@/lib/prompts';

export default function RepoSettingsPanel({ repoFullName }: { repoFullName: string }) {
	const t = useTranslations('repoSettings');
	const { settings, save, isLoading, isSaving } = useRepoSettings(repoFullName);
	const { configs } = useProjectConfig();
	const { showSnackbar } = useSnackbar();

	// Colonnes du board Project V2 couvrant ce repo (pour le select « colonne QA »).
	const boardColumns = useMemo(() => {
		const covering = resolveConfigForRepo(repoFullName, configs);
		return covering?.statusColumns ?? [];
	}, [repoFullName, configs]);

	const [prPrompt, setPrPrompt] = useState('');
	const [commitPushPrompt, setCommitPushPrompt] = useState('');
	const [filesToCopy, setFilesToCopy] = useState('');
	const [setupScript, setSetupScript] = useState('');
	const [setupScriptName, setSetupScriptName] = useState('');
	const [archiveScript, setArchiveScript] = useState('');
	const [qaColumn, setQaColumn] = useState('');

	// La valeur enregistrée reste sélectionnable même si le board a changé entre-temps
	// (évite un warning MUI « value out of range »).
	const qaColumnOptions = useMemo(() => {
		const set = new Set(boardColumns);
		if (qaColumn) set.add(qaColumn);
		return [...set];
	}, [boardColumns, qaColumn]);

	// Hydrate local state from server once loaded.
	useEffect(() => {
		if (isLoading) return;
		setPrPrompt(settings.create_pr_prompt);
		setCommitPushPrompt(settings.commit_push_prompt);
		setFilesToCopy(settings.files_to_copy);
		setSetupScript(settings.setup_script);
		setSetupScriptName(settings.setup_script_name);
		setArchiveScript(settings.archive_script);
		setQaColumn(settings.qa_column ?? '');
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading, repoFullName]);

	const handleSave = async () => {
		await save({
			create_pr_prompt: prPrompt,
			commit_push_prompt: commitPushPrompt,
			files_to_copy: filesToCopy,
			setup_script: setupScript,
			setup_script_name: setupScriptName,
			archive_script: archiveScript,
			qa_column: qaColumn,
		});
		showSnackbar(t('saved'), 'success');
	};

	return (
		<PageContainer>
			<PageHeader title={`${t('title')} — ${repoFullName}`} />

			<Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
				</Box>

				{/* Commit and push prompt */}
				<Box>
					<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
						{t('commitPushPrompt')}
					</Typography>
					<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
						{t('commitPushPromptDesc')}
					</Typography>
					<TextField
						fullWidth
						multiline
						minRows={2}
						value={commitPushPrompt}
						placeholder={DEFAULT_COMMIT_PUSH_PROMPT}
						onChange={(e) => setCommitPushPrompt(e.target.value)}
					/>
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
				</Box>

				{/* Scripts déclenchés à la main depuis la topbar */}
				<Box>
					<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
						{t('scripts')}
					</Typography>
					<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
						{t('scriptsDesc')}
					</Typography>
					<RepoScriptsEditor repoFullName={repoFullName} />
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
				</Box>

				{/* QA column — where a linked issue moves after its PR is merged */}
				<Box>
					<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
						{t('qaColumn')}
					</Typography>
					<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
						{t('qaColumnDesc')}
					</Typography>
					<TextField
						select
						fullWidth
						size="small"
						value={qaColumn}
						onChange={(e) => setQaColumn(e.target.value)}
						helperText={boardColumns.length === 0 ? t('qaColumnNoBoard') : undefined}
					>
						<MenuItem value="">
							<em>{t('qaColumnNone')}</em>
						</MenuItem>
						{qaColumnOptions.map((col) => (
							<MenuItem key={col} value={col}>
								{col}
							</MenuItem>
						))}
					</TextField>
				</Box>

				<Box>
					<Button variant="contained" disabled={isSaving} onClick={handleSave}>
						{t('save')}
					</Button>
				</Box>

				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{t('shareHint')}
				</Typography>
			</Box>
		</PageContainer>
	);
}
