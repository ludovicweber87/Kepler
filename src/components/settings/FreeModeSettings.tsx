'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import { useTranslations } from 'next-intl';
import { useAppSetting } from '@/hooks/useAppSetting';
import { useSnackbar } from '@/hooks/useSnackbar';
import { localFetch } from '@/lib/local-fetch';

export default function FreeModeSettings() {
	const t = useTranslations('settings');
	const tc = useTranslations('common');
	// Dossier dans lequel le mode libre lance l'agent (hors projet, hors worktree).
	const { value, save, isSaving } = useAppSetting('free_mode_path');
	const { showSnackbar } = useSnackbar();

	// `draft` prime sur la valeur DB dès que l'utilisateur tape (évite un effet d'init).
	const [draft, setDraft] = useState<string | null>(null);
	const [picking, setPicking] = useState(false);
	const input = draft ?? value ?? '';
	const trimmed = input.trim();

	const persist = async (next: string) => {
		await save(next);
		setDraft(null);
		showSnackbar(t('freeModePathSaved'), 'success');
	};

	// Le picker vit côté serveur agent (osascript) : agent éteint → saisie manuelle.
	const pickDirectory = async () => {
		setPicking(true);
		try {
			const res = await localFetch('/filesystem/pick-directory');
			const { path } = await res.json();
			if (path) await persist(path);
		} catch {
			showSnackbar(t('freeModePickError'), 'warning');
		} finally {
			setPicking(false);
		}
	};

	return (
		<Box>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				{t('freeModeDesc')}
			</Typography>
			<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
				<TextField
					size="small"
					label={t('freeModePathLabel')}
					placeholder="/Users/moi/Lab"
					value={input}
					onChange={(e) => setDraft(e.target.value)}
					helperText={t('freeModePathHelp')}
					sx={{ minWidth: 320, flex: 1 }}
				/>
				<Button
					variant="outlined"
					startIcon={picking ? <CircularProgress size={14} /> : <FolderOpenRoundedIcon />}
					onClick={() => void pickDirectory()}
					disabled={picking}
					sx={{ textTransform: 'none', fontWeight: 600, mt: 0.25 }}
				>
					{picking ? t('selecting') : t('browse')}
				</Button>
				<Button
					variant="contained"
					onClick={() => void persist(trimmed)}
					disabled={isSaving || trimmed === (value ?? '').trim()}
					sx={{ textTransform: 'none', fontWeight: 600, mt: 0.25 }}
				>
					{tc('save')}
				</Button>
			</Box>
		</Box>
	);
}
