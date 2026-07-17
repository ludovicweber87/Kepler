'use client';

import type { ComponentType } from 'react';
import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { alpha, useTheme } from '@mui/material/styles';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import { useTranslations } from 'next-intl';
import {
	SiCursor,
	SiWindsurf,
	SiZedindustries,
	SiIntellijidea,
	SiWebstorm,
	SiPhpstorm,
	SiPycharm,
	SiSublimetext,
} from 'react-icons/si';
import { VscVscode } from 'react-icons/vsc';
import { EDITORS, getEditorById } from '@/lib/editors';
import { useAppSetting } from '@/hooks/useAppSetting';
import { useSnackbar } from '@/hooks/useSnackbar';
import { localFetch } from '@/lib/local-fetch';

type IconType = ComponentType<{ size?: number }>;

const EDITOR_ICONS: Record<string, IconType> = {
	vscode: VscVscode,
	cursor: SiCursor,
	windsurf: SiWindsurf,
	zed: SiZedindustries,
	intellij: SiIntellijidea,
	webstorm: SiWebstorm,
	phpstorm: SiPhpstorm,
	pycharm: SiPycharm,
	sublime: SiSublimetext,
};

function EditorIcon({ id }: { id: string | null }) {
	const Icon = id ? EDITOR_ICONS[id] : undefined;
	if (!Icon) return <CodeRoundedIcon sx={{ fontSize: 16 }} />;
	return (
		<Box component="span" sx={{ display: 'inline-flex', fontSize: 16 }}>
			<Icon size={16} />
		</Box>
	);
}

const PLACEHOLDER = '__none__';

export default function EditorPicker({ worktreePath }: { worktreePath: string }) {
	const theme = useTheme();
	const t = useTranslations('header');
	const { showSnackbar } = useSnackbar();
	const { value: preferred, save } = useAppSetting('preferred_editor');

	const selected = preferred && getEditorById(preferred) ? preferred : PLACEHOLDER;

	const openInEditor = (id: string) => {
		const editor = getEditorById(id);
		if (!editor) return;
		localFetch('/filesystem/open-in-editor', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ app: editor.appName, path: worktreePath }),
		})
			.then(async (res) => {
				if (res.ok) {
					save(id).catch(() => {});
					return;
				}
				const data = (await res.json().catch(() => null)) as { code?: string } | null;
				showSnackbar(
					data?.code === 'editor_not_found'
						? t('editorNotInstalled', { editor: editor.label })
						: t('editorOpenError'),
					'error',
				);
			})
			.catch(() => showSnackbar(t('editorOpenError'), 'error'));
	};

	return (
		<Select
			value={selected}
			onChange={(e) => openInEditor(e.target.value as string)}
			size="small"
			aria-label={t('openInEditor')}
			renderValue={(value) => {
				const editor = getEditorById(value as string);
				return (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<EditorIcon id={editor?.id ?? null} />
						{editor ? editor.label : t('openInEditor')}
					</Box>
				);
			}}
			sx={{
				color: 'text.primary',
				fontSize: '0.75rem',
				bgcolor: 'background.paper',
				borderRadius: 2,
				'& .MuiSelect-select': {
					py: 0.75,
					pl: 1.25,
					display: 'flex',
					alignItems: 'center',
				},
				'& .MuiOutlinedInput-notchedOutline': {
					borderColor: 'divider',
				},
				'&:hover .MuiOutlinedInput-notchedOutline': {
					borderColor: alpha(theme.palette.primary.main, 0.5),
				},
			}}
		>
			<MenuItem value={PLACEHOLDER} sx={{ display: 'none' }} />
			{EDITORS.map((editor) => (
				<MenuItem key={editor.id} value={editor.id} sx={{ fontSize: '0.75rem', gap: 1 }}>
					<EditorIcon id={editor.id} />
					{editor.label}
				</MenuItem>
			))}
		</Select>
	);
}
