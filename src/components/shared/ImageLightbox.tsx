'use client';

import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';

interface Props {
	/** Image affichée en grand ; `null` ferme la visionneuse. */
	src: string | null;
	alt?: string;
	onClose: () => void;
}

/**
 * Visionneuse plein écran d'une image. Se ferme à l'Échap, au clic sur le fond, ou sur la
 * croix — le clic sur l'image elle-même ne ferme pas, pour pouvoir la survoler tranquillement.
 */
export default function ImageLightbox({ src, alt, onClose }: Props) {
	const tc = useTranslations('common');

	return (
		<Dialog
			open={src != null}
			onClose={onClose}
			maxWidth={false}
			slotProps={{
				paper: {
					sx: {
						bgcolor: 'transparent',
						boxShadow: 'none',
						backgroundImage: 'none',
						m: 2,
						overflow: 'visible',
					},
				},
			}}
		>
			<Box
				onClick={onClose}
				sx={{ position: 'relative', display: 'flex', cursor: 'zoom-out' }}
			>
				<IconButton
					aria-label={tc('close')}
					onClick={onClose}
					size="small"
					sx={{
						position: 'absolute',
						top: 8,
						right: 8,
						color: 'common.white',
						bgcolor: (th) => alpha(th.palette.common.black, 0.5),
						'&:hover': { bgcolor: (th) => alpha(th.palette.common.black, 0.7) },
					}}
				>
					<CloseRoundedIcon fontSize="small" />
				</IconButton>
				{src && (
					<Box
						component="img"
						src={src}
						alt={alt ?? ''}
						onClick={(e: React.MouseEvent) => e.stopPropagation()}
						sx={{
							display: 'block',
							maxWidth: '90vw',
							maxHeight: '90vh',
							borderRadius: 1,
							cursor: 'default',
						}}
					/>
				)}
			</Box>
		</Dialog>
	);
}
