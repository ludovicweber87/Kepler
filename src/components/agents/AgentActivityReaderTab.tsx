'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { AgentActivityLog } from '@/hooks/useAgentSession';
import { formatTime } from '@/lib/activityReport';
import ActivityMarkdown, { LOG_TYPE_COLORS } from './ActivityMarkdown';

interface AgentActivityReaderTabProps {
	logs: AgentActivityLog[];
}

/**
 * Lecteur pleine largeur du flux d'activité : mêmes entrées que la timeline
 * (summary + error), rendues en markdown large et aéré pour une lecture facile.
 */
export default function AgentActivityReaderTab({ logs }: AgentActivityReaderTabProps) {
	const t = useTranslations('agentActivity');
	const visibleLogs = logs.filter((l) => l.log_type === 'summary' || l.log_type === 'error');

	if (visibleLogs.length === 0) {
		return (
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
					bgcolor: 'background.default',
				}}
			>
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{t('noActivity')}
				</Typography>
			</Box>
		);
	}

	return (
		<Box
			sx={{
				height: '100%',
				overflowY: 'auto',
				px: 3,
				py: 2,
				bgcolor: 'background.default',
			}}
		>
			{visibleLogs.map((log) => (
				<Box key={log.id} sx={{ mb: 3 }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
						<Box
							sx={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								bgcolor: LOG_TYPE_COLORS[log.log_type],
								flexShrink: 0,
							}}
						/>
						<Typography
							variant="caption"
							sx={{
								color: 'text.disabled',
								fontFamily: 'monospace',
								fontSize: '0.7rem',
							}}
						>
							{formatTime(log.created_at)}
						</Typography>
					</Box>
					<ActivityMarkdown
						content={log.content}
						error={log.log_type === 'error'}
						variant="reader"
					/>
				</Box>
			))}
		</Box>
	);
}
