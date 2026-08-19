'use client';

import { useTranslations } from 'next-intl';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import PersonaLibrary from '@/components/personas/PersonaLibrary';

export default function PersonasPage() {
	const t = useTranslations('personas');

	return (
		<PageContainer>
			<PageHeader title={t('title')} />
			<PersonaLibrary />
		</PageContainer>
	);
}
