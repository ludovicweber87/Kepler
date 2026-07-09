'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import { useTranslations } from 'next-intl';

export default function ChatThinking({ text }: { text: string }) {
	const t = useTranslations('agentChat');
	const [open, setOpen] = useState(false);
	return (
		<Box sx={{ my: 0.5 }}>
			<Box
				onClick={() => setOpen((o) => !o)}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.5,
					cursor: 'pointer',
					color: 'text.disabled',
					fontSize: '0.7rem',
				}}
			>
				<PsychologyRoundedIcon sx={{ fontSize: 14 }} />
				<Typography variant="caption" sx={{ fontStyle: 'italic' }}>
					{t('thinking')}
				</Typography>
			</Box>
			<Collapse in={open}>
				<Typography
					variant="caption"
					sx={{
						display: 'block',
						pl: 2.5,
						color: 'text.disabled',
						whiteSpace: 'pre-wrap',
						fontStyle: 'italic',
					}}
				>
					{text}
				</Typography>
			</Collapse>
		</Box>
	);
}
