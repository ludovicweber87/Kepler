'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

interface DashboardWidgetProps {
	title: string;
	badge?: string | number;
	linkText?: string;
	onLinkClick?: () => void;
	children: React.ReactNode;
	minHeight?: number;
}

export default function DashboardWidget({
	title,
	badge,
	linkText,
	onLinkClick,
	children,
	minHeight,
}: DashboardWidgetProps) {
	const theme = useTheme();

	return (
		<Box
			sx={{
				bgcolor: 'background.paper',
				borderRadius: '10px',
				border: 1,
				borderColor: 'divider',
				p: 2,
				display: 'flex',
				flexDirection: 'column',
				minHeight: minHeight ?? 0,
				overflow: 'hidden',
				transition: 'border-color 0.2s',
				'&:hover': {
					borderColor: alpha(theme.palette.divider, 0.5),
				},
			}}
		>
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					mb: 1.5,
				}}
			>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
					<Typography
						variant="body2"
						sx={{ fontWeight: 600, fontSize: '0.82rem' }}
					>
						{title}
					</Typography>
					{badge != null && (
						<Box
							sx={{
								fontSize: '0.65rem',
								fontWeight: 600,
								bgcolor: alpha(theme.palette.primary.main, 0.12),
								color: 'primary.main',
								px: 0.75,
								py: 0.15,
								borderRadius: 1,
							}}
						>
							{badge}
						</Box>
					)}
				</Box>
				{linkText && (
					<Typography
						variant="caption"
						onClick={onLinkClick}
						sx={{
							color: 'primary.main',
							fontSize: '0.7rem',
							fontWeight: 600,
							cursor: 'pointer',
							'&:hover': { textDecoration: 'underline' },
						}}
					>
						{linkText}
					</Typography>
				)}
			</Box>
			<Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</Box>
		</Box>
	);
}
