'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

interface Props {
	name: string;
	color: string;
}

/** Inline pill marking the start of a persona's turn in the aggregated run chat. */
export default function PersonaTurnBadge({ name, color }: Props) {
	return (
		<Box sx={{ display: 'flex', justifyContent: 'center', my: 1.25 }}>
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
					sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }}
				/>
				<Typography
					variant="caption"
					sx={{ fontWeight: 700, color: 'text.primary' }}
					noWrap
				>
					{name}
				</Typography>
			</Box>
		</Box>
	);
}
