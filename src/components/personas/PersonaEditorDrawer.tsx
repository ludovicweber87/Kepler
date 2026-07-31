'use client';

import { useState } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { Persona, NewPersona } from '@/types';
import { MODEL_ALIASES, MODEL_VERSIONS, EFFORTS } from '@/lib/models';
import { CATEGORY_COLORS } from '@/components/shared/CategoryTabs';
import { shortRepoName, repoColor } from '@/lib/personaRepos';

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
	/** Repos configurés (`repo_paths`) — seule source des rattachements possibles. */
	repos: string[];
	onClose: () => void;
	onSave: (data: NewPersona & { id?: string }) => void;
	saving?: boolean;
}

export default function PersonaEditorDrawer({
	open,
	persona,
	repos,
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
					repos={repos}
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
	repos,
	onClose,
	onSave,
	saving,
}: {
	persona: Persona | null;
	repos: string[];
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
	// Repos rattachés. On garde les valeurs inconnues (repo dé-configuré depuis)
	// hors sélection : elles ne seraient pas rendables dans le multi-select.
	const [selectedRepos, setSelectedRepos] = useState<string[]>(
		(persona?.repos ?? []).filter((r) => repos.includes(r)),
	);

	const canSave = name.trim().length > 0 && !saving;

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
			repos: selectedRepos,
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

				<TextField
					select
					label={t('repos')}
					helperText={repos.length === 0 ? t('noReposHint') : t('reposHint')}
					value={selectedRepos}
					onChange={(e) => setSelectedRepos(e.target.value as unknown as string[])}
					size="small"
					fullWidth
					disabled={repos.length === 0}
					SelectProps={{
						multiple: true,
						displayEmpty: true,
						renderValue: (value) => {
							const picked = value as string[];
							if (picked.length === 0)
								return (
									<Typography variant="body2" color="text.secondary">
										{t('allReposBadge')}
									</Typography>
								);
							return (
								<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
									{picked.map((r) => {
										const c = repoColor(r, CATEGORY_COLORS);
										return (
											<Chip
												key={r}
												label={shortRepoName(r)}
												size="small"
												sx={{
													height: 20,
													fontSize: '0.68rem',
													bgcolor: alpha(c, 0.18),
													color: c,
												}}
											/>
										);
									})}
								</Box>
							);
						},
					}}
				>
					{repos.map((r) => (
						<MenuItem key={r} value={r} sx={{ py: 0.25 }}>
							<Checkbox
								size="small"
								checked={selectedRepos.includes(r)}
								sx={{ py: 0.25, mr: 0.5 }}
							/>
							<ListItemText
								primary={shortRepoName(r)}
								secondary={r}
								slotProps={{
									primary: { fontSize: '0.82rem' },
									secondary: { fontSize: '0.66rem' },
								}}
							/>
						</MenuItem>
					))}
				</TextField>
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
