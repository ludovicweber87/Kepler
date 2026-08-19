'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useTranslations } from 'next-intl';
import type { ChatToolCall } from '@/types';
import { extractFilePath, toolChipLabel, prettyToolName, docToolLabelKey } from '@/lib/toolCard';

export default function ChatToolCard({
	call,
	onOpen,
}: {
	call: ChatToolCall;
	onOpen?: (filePath: string) => void;
}) {
	const t = useTranslations('agentChat');
	const docKey = docToolLabelKey(call.name);
	const file = extractFilePath(call.input);
	const label = docKey ? t(docKey) : toolChipLabel(call.input);
	const clickable = !docKey && !!file && !!onOpen;

	return (
		<Box
			sx={{
				my: 0.5,
				maxWidth: '92%',
				display: 'flex',
				alignItems: 'center',
				gap: 0.75,
			}}
		>
			<Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
				{docKey ? t('docTool') : prettyToolName(call.name)}
			</Typography>

			{label && (
				<Box
					component="span"
					onClick={clickable ? () => onOpen?.(file!) : undefined}
					title={clickable ? file! : label}
					sx={{
						minWidth: 0,
						maxWidth: '70%',
						display: 'inline-flex',
						alignItems: 'center',
						px: 0.75,
						py: 0.25,
						borderRadius: 0.5,
						border: 1,
						borderColor: 'divider',
						bgcolor: (th) => th.palette.action.hover,
						fontFamily: 'var(--font-mono, ui-monospace, monospace)',
						fontSize: '0.72rem',
						lineHeight: 1.4,
						color: clickable ? 'text.primary' : 'text.secondary',
						cursor: clickable ? 'pointer' : 'default',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						transition: 'background-color 0.15s, border-color 0.15s',
						...(clickable && {
							'&:hover': {
								borderColor: 'primary.main',
								color: 'primary.main',
							},
						}),
					}}
				>
					{label}
				</Box>
			)}

			{call.status === 'running' ? (
				<CircularProgress size={12} />
			) : (
				<CheckRoundedIcon
					sx={{
						fontSize: 14,
						color: call.status === 'error' ? 'error.main' : 'success.main',
					}}
				/>
			)}
		</Box>
	);
}
