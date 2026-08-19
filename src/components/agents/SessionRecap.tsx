// src/components/agents/SessionRecap.tsx
'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildReport } from '@/lib/activityReport';
import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';

interface SessionRecapProps {
	session: AgentSession | null;
	logs: AgentActivityLog[];
}

function Centered({ text }: { text: string }) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100%',
				px: 2,
			}}
		>
			<Typography variant="caption" sx={{ color: 'text.disabled' }}>
				{text}
			</Typography>
		</Box>
	);
}

export default function SessionRecap({ session, logs }: SessionRecapProps) {
	const t = useTranslations('agentActivity');

	if (!session) return <Centered text={t('sessionLoading')} />;

	const visibleLogs = logs.filter((l) => l.log_type === 'summary' || l.log_type === 'error');
	if (visibleLogs.length === 0) return <Centered text={t('noActivity')} />;

	const markdown = buildReport(session, visibleLogs, {
		reportTitle: t('reportTitle'),
		branch: t('branch'),
	});

	return (
		<Box
			sx={{
				height: '100%',
				overflowY: 'auto',
				px: 2,
				py: 1.5,
				fontSize: '0.85rem',
				lineHeight: 1.6,
				color: 'text.primary',
				'& h2': { fontSize: '1rem', fontWeight: 700, mt: 0 },
				'& p': { my: 0.5 },
				'& ul': { pl: 2, my: 0.5 },
				'& code': {
					fontFamily: '"JetBrains Mono", monospace',
					fontSize: '0.78rem',
					bgcolor: 'background.default',
					px: 0.5,
					borderRadius: 0.5,
				},
				'& pre': {
					overflowX: 'auto',
					bgcolor: 'background.default',
					p: 1,
					borderRadius: 1,
				},
				'& a': { color: 'primary.main' },
			}}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
		</Box>
	);
}
