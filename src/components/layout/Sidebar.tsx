'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import MergeTypeRoundedIcon from '@mui/icons-material/MergeTypeRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { usePendingTodoCount } from '@/hooks/usePendingTodoCount';
import { useActiveSessions } from '@/hooks/useActiveSessions';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';

export const SIDEBAR_WIDTH = 220;

export default function Sidebar() {
	const theme = useTheme();
	const pathname = usePathname();
	const { data: session } = useSession();
	const t = useTranslations('sidebar');
	const pendingCount = usePendingTodoCount();
	const { data: activeSessions = [] } = useActiveSessions();
	const [launchOpen, setLaunchOpen] = useState(false);
	const mainItems = [
		{ label: t('dashboard'), href: '/dashboard', icon: <DashboardRoundedIcon /> },
		{ label: t('issues'), href: '/issues', icon: <BugReportRoundedIcon /> },
		{ label: t('prs'), href: '/prs', icon: <MergeTypeRoundedIcon /> },
		{
			label: t('workers'),
			href: '/workers',
			icon: <EngineeringRoundedIcon />,
			badge: activeSessions.length,
		},
		{ label: t('todos'), href: '/todos', icon: <ChecklistRoundedIcon />, badge: pendingCount },
	];

	const bottomItems = [
		{ label: t('settings'), href: '/settings', icon: <SettingsRoundedIcon /> },
	];

	return (
		<>
			<Drawer
				variant="permanent"
				sx={{
					width: SIDEBAR_WIDTH,
					flexShrink: 0,
					'& .MuiDrawer-paper': {
						width: SIDEBAR_WIDTH,
						boxSizing: 'border-box',
					},
				}}
			>
				<Box
					sx={{
						p: 2,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						animation: 'scaleIn 0.4s ease-out',
					}}
				>
					<Image src="/logo.svg" alt="Devora" width={170} height={40} priority />
				</Box>

				<Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
					<Box sx={{ px: 1.5, mt: 2, mb: 1.5 }}>
						<Button
							variant="contained"
							fullWidth
							startIcon={<RocketLaunchRoundedIcon sx={{ fontSize: 18 }} />}
							onClick={() => setLaunchOpen(true)}
							sx={{
								bgcolor: 'primary.main',
								textTransform: 'none',
								fontWeight: 600,
								fontSize: '0.8rem',
								py: 1,
								mb: 4,
								borderRadius: 1,
								'&:hover': { bgcolor: 'primary.dark' },
							}}
						>
							{t('launchAgent')}
						</Button>
					</Box>

					<List sx={{ px: 1.5 }}>
						{mainItems.map((item, index) => {
							const active =
								item.href === '/'
									? pathname === '/'
									: pathname.startsWith(item.href);
							return (
								<Link
									key={item.label}
									href={item.href}
									style={{ textDecoration: 'none', color: 'inherit' }}
								>
									<ListItemButton
										selected={active}
										sx={{
											borderRadius: 1,
											mb: 0.5,
											px: 2,
											py: 1,
											animation: `slideInLeft 0.35s ease-out ${index * 0.05}s both`,
											transition: 'background-color 0.15s, transform 0.15s',
											'&.Mui-selected': {
												bgcolor: alpha(theme.palette.primary.main, 0.18),
												color: 'primary.light',
												'& .MuiListItemIcon-root': {
													color: 'primary.light',
												},
											},
											'&:hover': {
												bgcolor: alpha(theme.palette.primary.main, 0.1),
												transform: 'translateX(4px)',
											},
										}}
									>
										<ListItemIcon
											sx={{ minWidth: 36, color: 'text.secondary' }}
										>
											{item.icon}
										</ListItemIcon>
										<ListItemText
											primary={item.label}
											primaryTypographyProps={{
												fontSize: '0.85rem',
												fontWeight: 500,
											}}
										/>
										{'badge' in item && (item.badge ?? 0) > 0 && (
											<Box
												component="span"
												sx={{
													bgcolor: 'warning.main',
													color: 'common.white',
													fontSize: '0.65rem',
													fontWeight: 700,
													lineHeight: 1,
													minWidth: 18,
													height: 18,
													borderRadius: 1,
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													px: 0.5,
												}}
											>
												{(item.badge ?? 0) > 99 ? '99+' : item.badge}
											</Box>
										)}
									</ListItemButton>
								</Link>
							);
						})}
					</List>

					<Box sx={{ flex: 1 }} />

					<List sx={{ px: 1.5, pb: 1 }}>
						<LocaleSwitcher />
						{bottomItems.map((item, index) => {
							const active = pathname.startsWith(item.href);
							return (
								<Link
									key={item.label}
									href={item.href}
									style={{ textDecoration: 'none', color: 'inherit' }}
								>
									<ListItemButton
										selected={active}
										sx={{
											borderRadius: 1,
											mb: 0.5,
											px: 2,
											py: 1,
											animation: `slideInLeft 0.35s ease-out ${(mainItems.length + index) * 0.05}s both`,
											transition: 'background-color 0.15s, transform 0.15s',
											'&.Mui-selected': {
												bgcolor: alpha(theme.palette.primary.main, 0.18),
												color: 'primary.light',
												'& .MuiListItemIcon-root': {
													color: 'primary.light',
												},
											},
											'&:hover': {
												bgcolor: alpha(theme.palette.primary.main, 0.1),
												transform: 'translateX(4px)',
											},
										}}
									>
										<ListItemIcon
											sx={{ minWidth: 36, color: 'text.secondary' }}
										>
											{item.icon}
										</ListItemIcon>
										<ListItemText
											primary={item.label}
											primaryTypographyProps={{
												fontSize: '0.85rem',
												fontWeight: 500,
											}}
										/>
									</ListItemButton>
								</Link>
							);
						})}
					</List>

					{session?.user && (
						<Box
							sx={{
								px: 2,
								pb: 2,
								pt: 1,
								borderTop: '1px solid',
								borderColor: 'divider',
								display: 'flex',
								alignItems: 'center',
								gap: 1.5,
							}}
						>
							<Avatar
								src={session.user.image ?? undefined}
								alt={session.user.name ?? ''}
								sx={{ width: 32, height: 32 }}
							/>
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Typography
									variant="body2"
									sx={{
										fontWeight: 600,
										fontSize: '0.8rem',
										lineHeight: 1.2,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{(session.user as { login?: string }).login ??
										session.user.name}
								</Typography>
							</Box>
							<Tooltip title={t('signOut')}>
								<IconButton
									size="small"
									onClick={() => signOut({ callbackUrl: '/login' })}
									sx={{ color: 'text.secondary' }}
								>
									<LogoutRoundedIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</Box>
					)}
				</Box>
			</Drawer>

			<AgentTerminalModal open={launchOpen} onClose={() => setLaunchOpen(false)} />
		</>
	);
}
