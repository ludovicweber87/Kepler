'use client';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useTranslations } from 'next-intl';
import type { QueuedMessage } from '@/hooks/useAgentChat';

export default function ChatQueued({
	message,
	onCancel,
}: {
	message: QueuedMessage;
	onCancel: (id: string) => void;
}) {
	const t = useTranslations('agentChat');
	return (
		<Box
			sx={{
				display: 'flex',
				justifyContent: 'flex-end',
				alignItems: 'center',
				gap: 0.5,
				px: 2,
				py: 0.75,
			}}
		>
			<Tooltip title={t('cancelQueued')} arrow>
				<IconButton
					size="small"
					onClick={() => onCancel(message.id)}
					aria-label={t('cancelQueued')}
					sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
				>
					<CloseRoundedIcon sx={{ fontSize: 15 }} />
				</IconButton>
			</Tooltip>
			<Box
				sx={{
					maxWidth: '78%',
					display: 'flex',
					alignItems: 'flex-start',
					gap: 0.75,
					px: 1.5,
					py: 1,
					borderRadius: 2,
					border: '1px dashed',
					borderColor: 'divider',
					bgcolor: (th) => th.palette.action.hover,
					color: 'text.secondary',
					fontSize: '0.8rem',
					lineHeight: 1.5,
				}}
			>
				<ScheduleRoundedIcon sx={{ fontSize: 15, mt: '2px', flexShrink: 0 }} />
				<Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
					{message.text}
				</Box>
			</Box>
		</Box>
	);
}
