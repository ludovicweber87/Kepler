'use client';

import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import { keyframes } from '@emotion/react';
import { alpha, useTheme } from '@mui/material/styles';
import Logo from './Logo';

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

export default function AppLoadingSplash() {
	const theme = useTheme();

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '100vh',
				bgcolor: 'background.default',
				animation: `${fadeIn} 0.4s ease-out`,
			}}
		>
			<Logo width={80} wordmark={false} />
			<LinearProgress
				sx={{
					mt: 3,
					width: 200,
					borderRadius: 1,
					bgcolor: alpha(theme.palette.primary.main, 0.15),
					'& .MuiLinearProgress-bar': {
						bgcolor: 'primary.main',
					},
				}}
			/>
		</Box>
	);
}
