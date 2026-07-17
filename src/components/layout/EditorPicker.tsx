'use client';

import type { ComponentType } from 'react';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import ArrowDropDownRoundedIcon from '@mui/icons-material/ArrowDropDownRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import { alpha, useTheme } from '@mui/material/styles';
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

export default function EditorPicker({ worktreePath }: { worktreePath: string }) {
	const theme = useTheme();
	const t = useTranslations('header');
	const { showSnackbar } = useSnackbar();
	const { value: preferred, save } = useAppSetting('preferred_editor');

	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

	const current = preferred && getEditorById(preferred) ? getEditorById(preferred) : undefined;

	const openInEditor = (id: string) => {
		const editor = getEditorById(id);
		if (!editor) return;
		localFetch('/filesystem/open-in-editor', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ app: editor.appName, path: worktreePath }),
		})
			.then(async (res) => {
				if (res.ok) return;
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

	const handleSelect = (id: string) => {
		save(id).catch(() => {});
		setAnchorEl(null);
	};

	return (
		<>
			<ButtonGroup
				variant="outlined"
				size="small"
				aria-label={t('openInEditor')}
				sx={{
					bgcolor: 'background.paper',
					borderRadius: 2,
					'& .MuiButtonGroup-grouped': {
						borderColor: 'divider',
						color: 'text.primary',
						minWidth: 0,
						py: 0.5,
						'&:hover': {
							borderColor: alpha(theme.palette.primary.main, 0.5),
							bgcolor: alpha(theme.palette.primary.main, 0.08),
						},
					},
				}}
			>
				<Tooltip title={current ? current.label : t('openInEditor')}>
					<Box component="span" sx={{ display: 'inline-flex' }}>
						<Button
							onClick={() => current && openInEditor(current.id)}
							disabled={!current}
							aria-label={current ? current.label : t('openInEditor')}
							sx={{ px: 1.25 }}
						>
							<EditorIcon id={current?.id ?? null} />
						</Button>
					</Box>
				</Tooltip>
				<Button
					onClick={(e) => setAnchorEl(e.currentTarget)}
					aria-label={t('openInEditor')}
					sx={{ px: 0.5 }}
				>
					<ArrowDropDownRoundedIcon sx={{ fontSize: 18 }} />
				</Button>
			</ButtonGroup>
			<Menu
				anchorEl={anchorEl}
				open={Boolean(anchorEl)}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
			>
				{EDITORS.map((editor) => (
					<MenuItem
						key={editor.id}
						selected={editor.id === current?.id}
						onClick={() => handleSelect(editor.id)}
						sx={{ fontSize: '0.75rem', gap: 1 }}
					>
						<EditorIcon id={editor.id} />
						{editor.label}
					</MenuItem>
				))}
			</Menu>
		</>
	);
}
