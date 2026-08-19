'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useTranslations } from 'next-intl';
import { useRepoScripts } from '@/hooks/useRepoScripts';
import { sortScripts } from '@/lib/repoScripts';
import type { RepoScript, RepoScriptRunMode } from '@/types';

/**
 * Liste éditable des scripts d'un repo. CRUD immédiat, indépendant du bouton
 * « Save » global de RepoSettingsPanel.
 */
export default function RepoScriptsEditor({ repoFullName }: { repoFullName: string }) {
	const t = useTranslations('repoSettings');
	const { scripts, create, update, remove } = useRepoScripts(repoFullName);

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
			{sortScripts(scripts).map((script) => (
				<ScriptRow
					key={script.id}
					script={script}
					onUpdate={update}
					onRemove={() => remove(script.id)}
				/>
			))}

			<Box>
				<Button size="small" startIcon={<AddRoundedIcon />} onClick={() => create()}>
					{t('addScript')}
				</Button>
			</Box>
		</Box>
	);
}

interface ScriptRowProps {
	script: RepoScript;
	onUpdate: (patch: {
		id: string;
		name?: string;
		script?: string;
		run_mode?: RepoScriptRunMode;
	}) => void;
	onRemove: () => void;
}

function ScriptRow({ script, onUpdate, onRemove }: ScriptRowProps) {
	const t = useTranslations('repoSettings');
	// Pas de resynchronisation depuis le serveur : les mutations sont optimistes, donc
	// le cache reflète déjà la saisie. Une row créée reçoit son id définitif au refetch,
	// ce qui change la `key` et remonte la ligne avec les bonnes valeurs.
	const [name, setName] = useState(script.name);
	const [body, setBody] = useState(script.script);

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 1,
				p: 1,
				border: 1,
				borderColor: 'divider',
				borderRadius: 2,
			}}
		>
			<TextField
				size="small"
				label={t('scriptName')}
				placeholder={t('scriptNamePlaceholder')}
				value={name}
				onChange={(e) => setName(e.target.value)}
				onBlur={() => name !== script.name && onUpdate({ id: script.id, name })}
				sx={{ width: 200, flexShrink: 0 }}
			/>

			<TextField
				size="small"
				multiline
				minRows={1}
				label={t('scriptCommand')}
				placeholder="pnpm test"
				value={body}
				onChange={(e) => setBody(e.target.value)}
				onBlur={() => body !== script.script && onUpdate({ id: script.id, script: body })}
				sx={{ flex: 1 }}
			/>

			{/* Un select n'a pas d'état « en cours de saisie » : on persiste sur onChange. */}
			<TextField
				select
				size="small"
				label={t('scriptMode')}
				value={script.run_mode}
				onChange={(e) =>
					onUpdate({ id: script.id, run_mode: e.target.value as RepoScriptRunMode })
				}
				sx={{ width: 140, flexShrink: 0 }}
			>
				<MenuItem value="terminal">{t('scriptModeTerminal')}</MenuItem>
				<MenuItem value="chat">{t('scriptModeChat')}</MenuItem>
			</TextField>

			<Tooltip title={t('deleteScript')} arrow>
				<IconButton
					size="small"
					onClick={onRemove}
					sx={{ mt: 0.5, color: 'text.secondary' }}
				>
					<DeleteOutlineRoundedIcon fontSize="small" />
				</IconButton>
			</Tooltip>
		</Box>
	);
}
