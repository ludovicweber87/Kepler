'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { useTranslations } from 'next-intl';

const blink = keyframes`
	0%, 80%, 100% { opacity: 0.2; }
	40% { opacity: 1; }
`;

export default function ChatPending() {
	const t = useTranslations('agentChat');
	return (
		<Box sx={{ display: 'flex', justifyContent: 'flex-start', px: 2, py: 0.5 }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
				<Typography variant="caption" sx={{ fontStyle: 'italic' }}>
					{t('pending')}
				</Typography>
				<Box sx={{ display: 'flex', gap: 0.4 }}>
					{[0, 1, 2].map((i) => (
						<Box
							key={i}
							sx={{
								width: 5,
								height: 5,
								borderRadius: '50%',
								bgcolor: 'text.secondary',
								animation: `${blink} 1.4s infinite both`,
								animationDelay: `${i * 0.2}s`,
							}}
						/>
					))}
				</Box>
			</Box>
		</Box>
	);
}
