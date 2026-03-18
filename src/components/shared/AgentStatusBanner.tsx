'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { useTranslations } from 'next-intl';

export default function AgentStatusBanner() {
	const { isAgentOnline, isChecking } = useAgentStatus();
	const t = useTranslations('common');

	// Don't show while checking, or if online
	if (isChecking || isAgentOnline) return null;

	return (
		<Box sx={{ px: 2, pt: 1 }}>
			<Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
				<Typography variant="body2">
					{t('agentOffline', {
						defaultMessage:
							'Agent local non connecté — lancez `npm run dev:agent` pour activer les fonctionnalités locales (terminal, git, agents).',
					})}
				</Typography>
			</Alert>
		</Box>
	);
}
