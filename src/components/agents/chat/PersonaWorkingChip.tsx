'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

interface Props {
	/** Libellé déjà formaté (ex. « Dev travaille »). */
	label: string;
	color: string;
}

/**
 * Pastille « en cours » affichée en haut du chat d'un run : point pulsant + libellé
 * indiquant quelle persona travaille actuellement. Rendue seulement quand un step tourne.
 */
export default function PersonaWorkingChip({ label, color }: Props) {
	return (
		<Box sx={{ display: 'flex', justifyContent: 'center', py: 0.75 }}>
			<Box
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.75,
					px: 1.25,
					py: 0.4,
					borderRadius: 999,
					border: 1,
					borderColor: alpha(color, 0.5),
					bgcolor: alpha(color, 0.12),
				}}
			>
				<Box
					sx={{
						width: 8,
						height: 8,
						borderRadius: '50%',
						bgcolor: color,
						flexShrink: 0,
						animation: 'devoraWorkingPulse 1.4s ease-in-out infinite',
						'@keyframes devoraWorkingPulse': {
							'0%, 100%': { opacity: 1, transform: 'scale(1)' },
							'50%': { opacity: 0.3, transform: 'scale(0.6)' },
						},
					}}
				/>
				<Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }} noWrap>
					{label}
				</Typography>
			</Box>
		</Box>
	);
}
