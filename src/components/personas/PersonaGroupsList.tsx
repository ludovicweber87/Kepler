'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { usePersonaGroups } from '@/hooks/usePersonaGroups';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { PersonaGroup } from '@/types';

interface Props {
	onOpen: (group: PersonaGroup) => void;
}

export default function PersonaGroupsList({ onOpen }: Props) {
	const t = useTranslations('personas');
	const { groups, create, remove } = usePersonaGroups();
	const { showSnackbar } = useSnackbar();

	const handleCreate = () => {
		const name = prompt(t('groupNamePlaceholder'));
		if (!name?.trim()) return;
		create.mutate(
			{ name: name.trim() },
			{
				onSuccess: (group) => onOpen(group),
				onError: () => showSnackbar(t('saveError'), 'error'),
			},
		);
	};

	const handleDelete = (e: React.MouseEvent, group: PersonaGroup) => {
		e.stopPropagation();
		remove.mutate(group.id, {
			onError: () => showSnackbar(t('deleteError'), 'error'),
		});
	};

	return (
		<Box>
			<Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
				<Button
					variant="contained"
					startIcon={<AddRoundedIcon />}
					onClick={handleCreate}
					sx={{ textTransform: 'none' }}
				>
					{t('newGroup')}
				</Button>
			</Stack>

			{groups.length === 0 ? (
				<Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
					{t('emptyGroups')}
				</Typography>
			) : (
				<Box
					sx={{
						display: 'grid',
						gap: 2,
						gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
					}}
				>
					{groups.map((g) => (
						<Box
							key={g.id}
							onClick={() => onOpen(g)}
							sx={{
								p: 2,
								borderRadius: 2.5,
								border: '1px solid',
								borderColor: 'divider',
								cursor: 'pointer',
								transition: 'transform 0.12s, border-color 0.12s',
								'&:hover': {
									transform: 'translateY(-2px)',
									borderColor: (theme) => alpha(theme.palette.primary.main, 0.6),
								},
							}}
						>
							<Stack direction="row" alignItems="center" spacing={1.5}>
								<AccountTreeRoundedIcon color="primary" />
								<Box sx={{ minWidth: 0, flex: 1 }}>
									<Typography noWrap fontWeight={600}>
										{g.name}
									</Typography>
									<Typography variant="caption" color="text.secondary">
										{(g.nodes ?? []).length} · {(g.edges ?? []).length}
									</Typography>
								</Box>
								<Tooltip title={t('delete')}>
									<IconButton size="small" onClick={(e) => handleDelete(e, g)}>
										<DeleteOutlineRoundedIcon fontSize="small" />
									</IconButton>
								</Tooltip>
							</Stack>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}
