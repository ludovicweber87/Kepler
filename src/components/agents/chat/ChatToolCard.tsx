'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { ChatToolCall } from '@/types';

function target(call: ChatToolCall): string {
	const inp = (call.input ?? {}) as Record<string, unknown>;
	return String(inp.file_path ?? inp.path ?? inp.command ?? '');
}

export default function ChatToolCard({ call }: { call: ChatToolCall }) {
	const t = useTranslations('agentChat');
	const [open, setOpen] = useState(false);
	const resultText =
		typeof call.result === 'string'
			? call.result
			: call.result != null
				? JSON.stringify(call.result, null, 2)
				: '';
	return (
		<Box
			sx={{
				my: 0.5,
				border: 1,
				borderColor: 'divider',
				borderRadius: 1.5,
				overflow: 'hidden',
				maxWidth: '92%',
			}}
		>
			<Box
				onClick={() => setOpen((o) => !o)}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.75,
					px: 1.25,
					py: 0.75,
					cursor: 'pointer',
					bgcolor: (th) => alpha(th.palette.primary.main, 0.08),
				}}
			>
				<BuildRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
				<Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
					{call.name}
				</Typography>
				<Typography
					variant="caption"
					sx={{
						color: 'text.secondary',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						flex: 1,
					}}
				>
					{target(call)}
				</Typography>
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
			<Collapse in={open}>
				<Box
					sx={{
						px: 1.25,
						py: 1,
						borderTop: 1,
						borderColor: 'divider',
						fontFamily: 'monospace',
						fontSize: '0.7rem',
						whiteSpace: 'pre-wrap',
						color: 'text.secondary',
					}}
				>
					{resultText || '—'}
					{call.truncated && (
						<Typography
							variant="caption"
							sx={{ display: 'block', color: 'warning.main', mt: 0.5 }}
						>
							… {t('truncated')}
						</Typography>
					)}
				</Box>
			</Collapse>
		</Box>
	);
}
