'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { usePersonas } from '@/hooks/usePersonas';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useSnackbar } from '@/hooks/useSnackbar';
import CategoryTabs, { CATEGORY_COLORS } from '@/components/shared/CategoryTabs';
import {
	ALL_REPOS,
	resolveActiveRepo,
	filterPersonasByRepo,
	reposOfPersona,
	shortRepoName,
	repoColor,
} from '@/lib/personaRepos';
import PersonaEditorDrawer from './PersonaEditorDrawer';
import type { Persona, NewPersona } from '@/types';

export default function PersonaLibrary() {
	const t = useTranslations('personas');
	const { personas, create, update, remove } = usePersonas();
	const { repoPaths } = useRepoPaths();
	const { showSnackbar } = useSnackbar();
	const [editing, setEditing] = useState<Persona | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [activeRepo, setActiveRepo] = useState<string>(ALL_REPOS);

	const repos = useMemo(() => repoPaths.map((r) => r.repo_full_name), [repoPaths]);
	const resolvedRepo = resolveActiveRepo(activeRepo, repos);
	const visible = useMemo(
		() => filterPersonasByRepo(personas, resolvedRepo),
		[personas, resolvedRepo],
	);
	const tabs = useMemo(
		() =>
			repos.map((r) => ({
				id: r,
				name: shortRepoName(r),
				color: repoColor(r, CATEGORY_COLORS),
			})),
		[repos],
	);

	const openCreate = () => {
		setEditing(null);
		setDrawerOpen(true);
	};
	const openEdit = (p: Persona) => {
		setEditing(p);
		setDrawerOpen(true);
	};

	const handleSave = (data: NewPersona & { id?: string }) => {
		const mutation = data.id
			? update.mutateAsync({ ...data, id: data.id })
			: create.mutateAsync(data);
		mutation
			.then(() => setDrawerOpen(false))
			.catch(() => showSnackbar(t('saveError'), 'error'));
	};

	const handleDelete = (p: Persona) => {
		if (!confirm(t('deleteConfirm'))) return;
		remove.mutate(p.id, {
			onError: () => showSnackbar(t('deleteError'), 'error'),
		});
	};

	return (
		<Box>
			<Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
				<Button
					variant="contained"
					startIcon={<AddRoundedIcon />}
					onClick={openCreate}
					sx={{ textTransform: 'none' }}
				>
					{t('newPersona')}
				</Button>
			</Stack>

			{/* Les onglets suivent les repos configurés : ni création ni suppression ici. */}
			<CategoryTabs
				items={tabs}
				activeId={resolvedRepo}
				onChange={setActiveRepo}
				labels={{ allTab: t('allTab') }}
			/>

			{visible.length === 0 ? (
				<Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
					{personas.length === 0 ? t('emptyLibrary') : t('emptyRepo')}
				</Typography>
			) : (
				<Box
					sx={{
						display: 'grid',
						gap: 2,
						mt: 2,
						gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
					}}
				>
					{visible.map((p) => (
						<PersonaCard
							key={p.id}
							persona={p}
							repos={reposOfPersona(p, repos)}
							onOpen={openEdit}
							onDelete={handleDelete}
							deleteLabel={t('delete')}
							allReposLabel={t('allReposBadge')}
						/>
					))}
				</Box>
			)}

			<PersonaEditorDrawer
				open={drawerOpen}
				persona={editing}
				repos={repos}
				onClose={() => setDrawerOpen(false)}
				onSave={handleSave}
				saving={create.isPending || update.isPending}
			/>
		</Box>
	);
}

function PersonaCard({
	persona,
	repos,
	onOpen,
	onDelete,
	deleteLabel,
	allReposLabel,
}: {
	persona: Persona;
	repos: string[];
	onOpen: (p: Persona) => void;
	onDelete: (p: Persona) => void;
	deleteLabel: string;
	allReposLabel: string;
}) {
	const color = persona.color ?? '#7C5CFF';

	return (
		<Box
			onClick={() => onOpen(persona)}
			sx={{
				p: 2,
				borderRadius: 2.5,
				border: '1px solid',
				borderColor: 'divider',
				cursor: 'pointer',
				transition: 'transform 0.12s, border-color 0.12s',
				'&:hover': {
					transform: 'translateY(-2px)',
					borderColor: alpha(color, 0.6),
				},
			}}
		>
			<Stack direction="row" alignItems="center" spacing={1.5}>
				<Avatar
					sx={{
						bgcolor: color,
						width: 36,
						height: 36,
						fontSize: 15,
						fontWeight: 600,
					}}
				>
					{persona.name.slice(0, 2).toUpperCase()}
				</Avatar>
				<Box sx={{ minWidth: 0, flex: 1 }}>
					<Typography noWrap fontWeight={600}>
						{persona.name}
					</Typography>
					{persona.role && (
						<Typography
							noWrap
							variant="caption"
							color="text.secondary"
							sx={{ display: 'block' }}
						>
							{persona.role}
						</Typography>
					)}
				</Box>
				<Tooltip title={deleteLabel}>
					<IconButton
						size="small"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(persona);
						}}
					>
						<DeleteOutlineRoundedIcon fontSize="small" />
					</IconButton>
				</Tooltip>
			</Stack>

			<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.25 }}>
				{repos.length === 0 ? (
					<RepoBadge label={allReposLabel} />
				) : (
					repos.map((r) => (
						<RepoBadge
							key={r}
							label={shortRepoName(r)}
							color={repoColor(r, CATEGORY_COLORS)}
						/>
					))
				)}
			</Box>
		</Box>
	);
}

function RepoBadge({ label, color }: { label: string; color?: string }) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 0.5,
				fontSize: '0.62rem',
				color: 'text.secondary',
				bgcolor: (th) => alpha(color ?? th.palette.text.primary, color ? 0.12 : 0.05),
				borderRadius: 999,
				px: 0.85,
				py: 0.15,
			}}
		>
			{color && (
				<Box
					sx={{
						width: 6,
						height: 6,
						borderRadius: '50%',
						bgcolor: color,
					}}
				/>
			)}
			{label}
		</Box>
	);
}
