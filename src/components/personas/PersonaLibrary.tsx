'use client';

import { useState } from 'react';
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
import { useSnackbar } from '@/hooks/useSnackbar';
import PersonaEditorDrawer from './PersonaEditorDrawer';
import type { Persona, NewPersona } from '@/types';

export default function PersonaLibrary() {
	const t = useTranslations('personas');
	const { personas, create, update, remove } = usePersonas();
	const { showSnackbar } = useSnackbar();
	const [editing, setEditing] = useState<Persona | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);

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
			onError: (err) => {
				const groups = (err as Error & { groups?: string[] }).groups;
				if (groups?.length) {
					showSnackbar(t('inUseError', { groups: groups.join(', ') }), 'warning');
				} else {
					showSnackbar(t('deleteError'), 'error');
				}
			},
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

			{personas.length === 0 ? (
				<Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
					{t('emptyLibrary')}
				</Typography>
			) : (
				<Box
					sx={{
						display: 'grid',
						gap: 2,
						gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
					}}
				>
					{personas.map((p) => (
						<Box
							key={p.id}
							onClick={() => openEdit(p)}
							sx={{
								p: 2,
								borderRadius: 2.5,
								border: '1px solid',
								borderColor: 'divider',
								cursor: 'pointer',
								transition: 'transform 0.12s, border-color 0.12s',
								'&:hover': {
									transform: 'translateY(-2px)',
									borderColor: alpha(p.color ?? '#7C5CFF', 0.6),
								},
							}}
						>
							<Stack direction="row" alignItems="center" spacing={1.5}>
								<Avatar
									sx={{
										bgcolor: p.color ?? '#7C5CFF',
										width: 36,
										height: 36,
										fontSize: 15,
										fontWeight: 600,
									}}
								>
									{p.name.slice(0, 2).toUpperCase()}
								</Avatar>
								<Box sx={{ minWidth: 0, flex: 1 }}>
									<Typography noWrap fontWeight={600}>
										{p.name}
									</Typography>
									{p.role && (
										<Typography noWrap variant="caption" color="text.secondary">
											{p.role}
										</Typography>
									)}
								</Box>
								<Tooltip title={t('delete')}>
									<IconButton
										size="small"
										onClick={(e) => {
											e.stopPropagation();
											handleDelete(p);
										}}
									>
										<DeleteOutlineRoundedIcon fontSize="small" />
									</IconButton>
								</Tooltip>
							</Stack>
						</Box>
					))}
				</Box>
			)}

			<PersonaEditorDrawer
				open={drawerOpen}
				persona={editing}
				onClose={() => setDrawerOpen(false)}
				onSave={handleSave}
				saving={create.isPending || update.isPending}
			/>
		</Box>
	);
}
