'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { useTranslations } from 'next-intl';
import PersonaLibrary from '@/components/personas/PersonaLibrary';
import PersonaGroupsList from '@/components/personas/PersonaGroupsList';
import PersonaGroupEditor from '@/components/personas/PersonaGroupEditor';
import type { PersonaGroup } from '@/types';

type Tab = 'library' | 'groups';

export default function PersonasPage() {
	const t = useTranslations('personas');
	const [tab, setTab] = useState<Tab>('library');
	const [editorGroup, setEditorGroup] = useState<PersonaGroup | null>(null);

	if (editorGroup) {
		return (
			<Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
				<PersonaGroupEditor group={editorGroup} onClose={() => setEditorGroup(null)} />
			</Box>
		);
	}

	return (
		<Box sx={{ p: 3 }}>
			<Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
				{t('title')}
			</Typography>

			<Stack direction="row" spacing={1} sx={{ mb: 3 }}>
				<Chip
					label={t('tabLibrary')}
					color={tab === 'library' ? 'primary' : 'default'}
					variant={tab === 'library' ? 'filled' : 'outlined'}
					onClick={() => setTab('library')}
				/>
				<Chip
					label={t('tabGroups')}
					color={tab === 'groups' ? 'primary' : 'default'}
					variant={tab === 'groups' ? 'filled' : 'outlined'}
					onClick={() => setTab('groups')}
				/>
			</Stack>

			{tab === 'library' ? <PersonaLibrary /> : <PersonaGroupsList onOpen={setEditorGroup} />}
		</Box>
	);
}
