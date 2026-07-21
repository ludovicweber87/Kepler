'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import PersonaLibrary from '@/components/personas/PersonaLibrary';

export default function PersonasPage() {
	const t = useTranslations('personas');

	return (
		<Box sx={{ p: 3 }}>
			<Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
				{t('title')}
			</Typography>

			<PersonaLibrary />
		</Box>
	);
}
