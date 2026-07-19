'use client';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

/** Largeur unique appliquée à tous les onglets gauches (Chat/Récap, Workflow, fichiers). */
export const FILE_TAB_WIDTH = 160;

interface FileTabLabelProps {
	/** Nom de fichier affiché (tronqué en ellipsis si trop long). */
	name: string;
	/** Chemin complet, affiché en tooltip. */
	path: string;
	/** Ferme l'onglet fichier. */
	onClose: () => void;
	/** Libellé accessible du bouton de fermeture (traduit). */
	closeLabel: string;
}

export default function FileTabLabel({ name, path, onClose, closeLabel }: FileTabLabelProps) {
	return (
		<Box
			component="span"
			sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, width: '100%' }}
		>
			<Tooltip title={path} arrow>
				<Box
					component="span"
					sx={{
						flex: 1,
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{name}
				</Box>
			</Tooltip>
			<Box
				component="span"
				role="button"
				tabIndex={0}
				aria-label={closeLabel}
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.stopPropagation();
						e.preventDefault();
						onClose();
					}
				}}
				sx={{
					display: 'inline-flex',
					flexShrink: 0,
					borderRadius: '50%',
					'&:hover': { color: 'error.main' },
				}}
			>
				<CloseRoundedIcon sx={{ fontSize: 14 }} />
			</Box>
		</Box>
	);
}
