'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import type { AgentActivityLog } from '@/hooks/useAgentSession';

export const LOG_TYPE_COLORS: Record<AgentActivityLog['log_type'], string> = {
	info: 'text.disabled',
	commit: 'success.main',
	file_change: 'warning.main',
	error: 'error.main',
	summary: 'primary.main',
	ask_question: 'warning.main',
};

interface ActivityMarkdownProps {
	content: string;
	error?: boolean;
	/** `compact` = timeline étroite ; `reader` = panneau large et aéré. */
	variant?: 'compact' | 'reader';
}

/**
 * Rendu markdown partagé d'une entrée d'activité. Source unique de vérité du
 * style, réutilisée par la timeline (`AgentActivityTab`) et le lecteur pleine
 * largeur (`AgentActivityReaderTab`) — pas de dérive entre les deux.
 */
export default function ActivityMarkdown({
	content,
	error = false,
	variant = 'compact',
}: ActivityMarkdownProps) {
	const reader = variant === 'reader';
	return (
		<Box
			sx={{
				flex: reader ? undefined : 1,
				fontSize: reader ? '0.9rem' : '0.78rem',
				lineHeight: reader ? 1.65 : 1.5,
				color: error ? 'error.main' : 'text.primary',
				wordBreak: 'break-word',
				pl: reader ? 0 : 1,
				'& p': { m: 0 },
				'& p + p': { mt: reader ? 1 : 0.5 },
				'& ul, & ol': { m: 0, pl: 2.5 },
				'& li': { mb: reader ? 0.4 : 0.25 },
				'& a': { color: 'primary.main' },
				'& code': {
					fontFamily: 'monospace',
					fontSize: reader ? '0.82rem' : '0.72rem',
					bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
					px: 0.5,
					borderRadius: 0.5,
				},
				'& pre': {
					overflowX: 'auto',
					bgcolor: 'background.default',
					p: 1,
					borderRadius: 1,
					my: reader ? 1 : 0.5,
				},
				'& pre code': { bgcolor: 'transparent', px: 0 },
				'& h1, & h2, & h3, & h4': {
					fontSize: reader ? '1rem' : '0.82rem',
					fontWeight: 700,
					m: 0,
					mt: reader ? 1 : 0.5,
				},
			}}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
		</Box>
	);
}
