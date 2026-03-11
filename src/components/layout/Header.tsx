'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import { alpha } from '@mui/material/styles';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import { SIDEBAR_WIDTH } from './Sidebar';
import { useRightSidebar } from '@/hooks/useRightSidebar';
import { useActiveSessions } from '@/hooks/useActiveSessions';
import { useColorMode } from '@/hooks/useColorMode';
import { useTranslations } from 'next-intl';

export default function Header() {
	const { open, toggle, width: rightWidth } = useRightSidebar();
	const { data: sessions = [] } = useActiveSessions();
	const { mode, toggleColorMode } = useColorMode();
	const t = useTranslations('header');

	return (
		<AppBar
			position="fixed"
			elevation={0}
			sx={{
				width: `calc(100% - ${SIDEBAR_WIDTH}px - ${open ? rightWidth : 0}px)`,
				ml: `${SIDEBAR_WIDTH}px`,
				transition: 'width 0.2s',
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
									bgcolor: alpha('#7C5CFF', 0.15),
									color: '#7C5CFF',
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

					{/* Agents toggle */}
					<Tooltip title={open ? t('hideAgents') : t('showAgents')}>
						<IconButton
							onClick={toggle}
							size="small"
							sx={{
								color: open ? '#7C5CFF' : 'text.secondary',
								bgcolor: open ? alpha('#7C5CFF', 0.12) : 'transparent',
								'&:hover': {
									bgcolor: alpha('#7C5CFF', 0.15),
									color: '#7C5CFF',
								},
							}}
						>
							<Badge
								badgeContent={sessions.length}
								color="success"
								invisible={sessions.length === 0}
								sx={{
									'& .MuiBadge-badge': {
										fontSize: '0.6rem',
										height: 14,
										minWidth: 14,
										fontWeight: 700,
									},
								}}
							>
								<SmartToyRoundedIcon fontSize="small" />
							</Badge>
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
								boxShadow: '0 0 0 2px rgba(124, 92, 255, 0.5)',
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
