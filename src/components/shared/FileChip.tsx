'use client';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { alpha } from '@mui/material/styles';
import { attachmentTypeLabel } from '@/lib/fileAttach';

/**
 * Pastille d'une pièce jointe non-image (dans le composer avant envoi, dans la bulle
 * après). Le type y est écrit en clair : c'est la seule info visible sur un fichier
 * que, contrairement à une image, on ne peut pas prévisualiser.
 */
export default function FileChip({
	name,
	mediaType,
	href,
	onRemove,
	removeLabel,
}: {
	name: string;
	mediaType: string;
	/** Ouvre le fichier servi par l'agent. Absent dans le composer (rien n'est encore écrit). */
	href?: string;
	onRemove?: () => void;
	removeLabel?: string;
}) {
	return (
		<Box sx={{ position: 'relative', maxWidth: '100%' }}>
			<Box
				component={href ? 'a' : 'div'}
				href={href}
				target={href ? '_blank' : undefined}
				rel={href ? 'noreferrer' : undefined}
				title={`${name} — ${mediaType}`}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.75,
					maxWidth: 260,
					px: 1,
					py: 0.5,
					mt: 0.5,
					borderRadius: 1,
					border: '1px solid',
					borderColor: 'divider',
					bgcolor: (th) => alpha(th.palette.text.primary, 0.04),
					color: 'inherit',
					textDecoration: 'none',
					...(href && { '&:hover': { borderColor: 'primary.main' } }),
				}}
			>
				<DescriptionRoundedIcon sx={{ fontSize: 16, flexShrink: 0, opacity: 0.7 }} />
				<Box sx={{ minWidth: 0 }}>
					<Typography
						variant="caption"
						sx={{
							display: 'block',
							fontSize: '0.72rem',
							fontWeight: 600,
							lineHeight: 1.3,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{name}
					</Typography>
					<Typography
						variant="caption"
						sx={{
							display: 'block',
							fontSize: '0.62rem',
							opacity: 0.7,
							lineHeight: 1.2,
						}}
					>
						{attachmentTypeLabel(name, mediaType)}
					</Typography>
				</Box>
			</Box>
			{onRemove && (
				<IconButton
					size="small"
					aria-label={removeLabel}
					onClick={onRemove}
					sx={{
						position: 'absolute',
						top: -2,
						right: -6,
						p: 0.15,
						bgcolor: 'background.paper',
						border: '1px solid',
						borderColor: 'divider',
						'&:hover': { bgcolor: 'background.paper' },
					}}
				>
					<CloseRoundedIcon sx={{ fontSize: 12 }} />
				</IconButton>
			)}
		</Box>
	);
}
