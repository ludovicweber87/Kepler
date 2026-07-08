'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import { SIDEBAR_WIDTH } from './Sidebar';
import { useColorMode } from '@/hooks/useColorMode';
import { useTranslations } from 'next-intl';

export default function Header() {
	const theme = useTheme();
	const { mode, toggleColorMode } = useColorMode();
	const t = useTranslations('header');

	return (
		<AppBar
			position="fixed"
			elevation={0}
			sx={{
				width: `calc(100% - ${SIDEBAR_WIDTH}px)`,
				ml: `${SIDEBAR_WIDTH}px`,
				bgcolor: 'transparent',
				backdropFilter: 'blur(12px)',
				borderBottom: 1,
				borderColor: 'divider',
				animation: 'fadeIn 0.3s ease-out',
			}}
		>
			<Toolbar sx={{ px: { xs: 2, md: 4 }, py: 0.5, justifyContent: 'flex-end' }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
					{/* Theme toggle */}
					<Tooltip title={mode === 'dark' ? t('lightMode') : t('darkMode')}>
						<IconButton
							onClick={toggleColorMode}
							size="small"
							sx={{
								color: 'text.secondary',
								'&:hover': {
									bgcolor: alpha(theme.palette.primary.main, 0.15),
									color: 'primary.main',
								},
							}}
						>
							{mode === 'dark' ? (
								<LightModeRoundedIcon fontSize="small" />
							) : (
								<DarkModeRoundedIcon fontSize="small" />
							)}
						</IconButton>
					</Tooltip>

					<Avatar
						sx={{
							width: 34,
							height: 34,
							bgcolor: 'primary.dark',
							fontSize: '0.85rem',
							fontWeight: 600,
							transition: 'box-shadow 0.2s',
							'&:hover': {
								boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.5)}`,
							},
						}}
					>
						LW
					</Avatar>
				</Box>
			</Toolbar>
		</AppBar>
	);
}
