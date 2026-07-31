'use client';

import { useState } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { Persona, NewPersona, PersonaFolder } from '@/types';
import { MODEL_ALIASES, MODEL_VERSIONS, EFFORTS } from '@/lib/models';
import { CATEGORY_COLORS } from '@/components/shared/CategoryTabs';

export const PERSONA_COLORS = [
	'#7C5CFF',
	'#00D4FF',
	'#22C55E',
	'#F59E0B',
	'#EF4444',
	'#EC4899',
	'#14B8A6',
	'#A855F7',
];

const PERMISSION_OPTIONS = ['', 'default', 'acceptEdits', 'bypassPermissions', 'plan'];

interface Props {
	open: boolean;
	persona: Persona | null;
	folders: PersonaFolder[];
	onCreateFolder: (name: string, color: string) => Promise<PersonaFolder>;
	onClose: () => void;
	onSave: (data: NewPersona & { id?: string }) => void;
	saving?: boolean;
}

export default function PersonaEditorDrawer({
	open,
	persona,
	folders,
	onCreateFolder,
	onClose,
	onSave,
	saving,
}: Props) {
	return (
		<Drawer anchor="right" open={open} onClose={onClose}>
			{open && (
				<PersonaForm
					key={persona?.id ?? 'new'}
					persona={persona}
					folders={folders}
					onCreateFolder={onCreateFolder}
					onClose={onClose}
					onSave={onSave}
					saving={saving}
				/>
			)}
		</Drawer>
	);
}

function PersonaForm({
	persona,
	folders,
	onCreateFolder,
	onClose,
	onSave,
	saving,
}: {
	persona: Persona | null;
	folders: PersonaFolder[];
	onCreateFolder: (name: string, color: string) => Promise<PersonaFolder>;
	onClose: () => void;
	onSave: (data: NewPersona & { id?: string }) => void;
	saving?: boolean;
}) {
	const t = useTranslations('personas');
	const tc = useTranslations('common');
	const [name, setName] = useState(persona?.name ?? '');
	const [role, setRole] = useState(persona?.role ?? '');
	const [systemPrompt, setSystemPrompt] = useState(persona?.system_prompt ?? '');
	const [model, setModel] = useState(persona?.model ?? '');
	const [effort, setEffort] = useState(persona?.effort ?? '');
	const [permissionMode, setPermissionMode] = useState(persona?.permission_mode ?? '');
	const [color, setColor] = useState<string>(persona?.color ?? PERSONA_COLORS[0]);
	const [folderIds, setFolderIds] = useState<string[]>(persona?.folder_ids ?? []);
	const [newFolder, setNewFolder] = useState('');
	const [creatingFolder, setCreatingFolder] = useState(false);

	const canSave = name.trim().length > 0 && !saving;

	const toggleFolder = (id: string) =>
		setFolderIds((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

	// Création à la volée depuis le drawer : le nouveau folder est coché d'office.
	const handleCreateFolder = async () => {
		const trimmed = newFolder.trim();
		if (!trimmed) return;
		setCreatingFolder(true);
		try {
			const created = await onCreateFolder(
				trimmed,
				CATEGORY_COLORS[folders.length % CATEGORY_COLORS.length],
			);
			setFolderIds((prev) => [...prev, created.id]);
			setNewFolder('');
		} catch {
			// L'erreur est déjà remontée en snackbar par le parent.
		} finally {
			setCreatingFolder(false);
		}
	};

	const handleSave = () => {
		if (!canSave) return;
		onSave({
			id: persona?.id,
			name: name.trim(),
			role: role.trim(),
			system_prompt: systemPrompt,
			model: model || null,
			effort: (effort || null) as NewPersona['effort'],
			permission_mode: (permissionMode || null) as NewPersona['permission_mode'],
			color,
			folder_ids: folderIds,
		});
	};

	return (
		<Box
			sx={{
				width: 460,
				maxWidth: '90vw',
				p: 3,
				display: 'flex',
				flexDirection: 'column',
				height: '100%',
			}}
		>
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="space-between"
				sx={{ mb: 2 }}
			>
				<Typography variant="h6">{persona ? t('editPersona') : t('newPersona')}</Typography>
				<IconButton onClick={onClose} size="small">
					<CloseRoundedIcon />
				</IconButton>
			</Stack>

			<Stack spacing={2} sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
				<TextField
					label={t('name')}
					placeholder={t('namePlaceholder')}
					value={name}
					onChange={(e) => setName(e.target.value)}
					fullWidth
					size="small"
					autoFocus
				/>
				<TextField
					label={t('role')}
					helperText={t('roleHint')}
					value={role}
					onChange={(e) => setRole(e.target.value)}
					fullWidth
					size="small"
				/>
				<TextField
					label={t('systemPrompt')}
					value={systemPrompt}
					onChange={(e) => setSystemPrompt(e.target.value)}
					fullWidth
					multiline
					minRows={6}
					size="small"
				/>

				<Stack direction="row" spacing={1.5}>
					<TextField
						select
						label={t('model')}
						value={model}
						onChange={(e) => setModel(e.target.value)}
						size="small"
						sx={{ flex: 1 }}
					>
						<MenuItem value="">{t('defaultOption')}</MenuItem>
						<ListSubheader>{tc('modelGroupAliases')}</ListSubheader>
						{MODEL_ALIASES.map((m) => (
							<MenuItem key={m.value} value={m.value}>
								{tc(m.key)}
							</MenuItem>
						))}
						<ListSubheader>{tc('modelGroupVersions')}</ListSubheader>
						{MODEL_VERSIONS.map((m) => (
							<MenuItem key={m.value} value={m.value}>
								{tc(m.key)}
							</MenuItem>
						))}
					</TextField>
					<TextField
						select
						label={t('effort')}
						value={effort}
						onChange={(e) => setEffort(e.target.value)}
						size="small"
						sx={{ flex: 1 }}
					>
						<MenuItem value="">{t('defaultOption')}</MenuItem>
						{EFFORTS.map((e) => (
							<MenuItem key={e.value} value={e.value}>
								{tc(e.key)}
							</MenuItem>
						))}
					</TextField>
				</Stack>

				<TextField
					select
					label={t('permissionMode')}
					value={permissionMode}
					onChange={(e) => setPermissionMode(e.target.value)}
					size="small"
					fullWidth
				>
					{PERMISSION_OPTIONS.map((m) => (
						<MenuItem key={m || 'default'} value={m}>
							{m || t('defaultOption')}
						</MenuItem>
					))}
				</TextField>

				<Box>
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ display: 'block', mb: 1 }}
					>
						{t('color')}
					</Typography>
					<Stack direction="row" spacing={1}>
						{PERSONA_COLORS.map((c) => (
							<Box
								key={c}
								onClick={() => setColor(c)}
								sx={{
									width: 28,
									height: 28,
									borderRadius: '50%',
									bgcolor: c,
									cursor: 'pointer',
									border: '2px solid',
									borderColor: color === c ? 'text.primary' : 'transparent',
									transition: 'transform 0.1s',
									'&:hover': { transform: 'scale(1.15)' },
								}}
							/>
						))}
					</Stack>
				</Box>

				<Box>
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ display: 'block', mb: 1 }}
					>
						{t('folders')}
					</Typography>
					{folders.length > 0 && (
						<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
							{folders.map((f) => {
								const on = folderIds.includes(f.id);
								return (
									<Chip
										key={f.id}
										label={f.name}
										size="small"
										onClick={() => toggleFolder(f.id)}
										variant={on ? 'filled' : 'outlined'}
										sx={{
											height: 24,
											fontSize: '0.72rem',
											bgcolor: on ? alpha(f.color, 0.2) : 'transparent',
											color: on ? f.color : 'text.secondary',
											borderColor: alpha(f.color, 0.5),
										}}
									/>
								);
							})}
						</Box>
					)}
					<Stack direction="row" spacing={1}>
						<TextField
							size="small"
							fullWidth
							placeholder={t('newFolderPlaceholder')}
							value={newFolder}
							onChange={(e) => setNewFolder(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									void handleCreateFolder();
								}
							}}
						/>
						<IconButton
							size="small"
							onClick={() => void handleCreateFolder()}
							disabled={!newFolder.trim() || creatingFolder}
						>
							<AddRoundedIcon fontSize="small" />
						</IconButton>
					</Stack>
				</Box>
			</Stack>

			<Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
				<Button onClick={onClose} sx={{ textTransform: 'none' }}>
					{t('cancel')}
				</Button>
				<Button
					variant="contained"
					onClick={handleSave}
					disabled={!canSave}
					sx={{ textTransform: 'none', ml: 'auto' }}
				>
					{t('save')}
				</Button>
			</Stack>
		</Box>
	);
}
