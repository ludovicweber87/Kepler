'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import { alpha } from '@mui/material/styles';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import CircleRoundedIcon from '@mui/icons-material/CircleRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import { SIDEBAR_WIDTH } from './Sidebar';
import { useRightSidebar } from '@/hooks/useRightSidebar';
import { useActiveSessions } from '@/hooks/useActiveSessions';
import { useNotifications } from '@/hooks/useNotifications';
import type { Notification } from '@/types';

function formatNotifTime(dateStr: string): string {
	const d = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffMin = Math.floor(diffMs / 60000);
	if (diffMin < 1) return "à l'instant";
	if (diffMin < 60) return `il y a ${diffMin}min`;
	const diffH = Math.floor(diffMin / 60);
	if (diffH < 24) return `il y a ${diffH}h`;
	return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getNotifIcon(type: string) {
	if (type === 'report_published') return <PublishRoundedIcon sx={{ fontSize: 16, color: '#7C5CFF' }} />;
	return <CircleRoundedIcon sx={{ fontSize: 10, color: '#7C5CFF' }} />;
}

export default function Header() {
	const { open, toggle, width: rightWidth } = useRightSidebar();
	const { data: sessions = [] } = useActiveSessions();
	const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
	const router = useRouter();

	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const popoverOpen = Boolean(anchorEl);

	const handleOpen = useCallback((e: React.MouseEvent<HTMLElement>) => {
		setAnchorEl(e.currentTarget);
	}, []);

	const handleClose = useCallback(() => {
		setAnchorEl(null);
	}, []);

	const handleClickNotif = useCallback(
		(notif: Notification) => {
			if (!notif.read) markAsRead(notif.id);
			handleClose();
			if (notif.issue_owner && notif.issue_repo && notif.issue_number) {
				router.push(`/task/${notif.issue_owner}/${notif.issue_repo}/${notif.issue_number}`);
			}
		},
		[markAsRead, handleClose, router],
	);

	const handleSeeAll = useCallback(() => {
		handleClose();
		router.push('/notifications');
	}, [handleClose, router]);

	const recentNotifs = notifications.slice(0, 8);

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
				animation: 'fadeIn 0.3s ease-out',
			}}
		>
			<Toolbar sx={{ px: { xs: 2, md: 4 }, py: 0.5, justifyContent: 'flex-end' }}>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
					{/* Notifications bell */}
					<Tooltip title="Notifications">
						<IconButton
							onClick={handleOpen}
							size="small"
							sx={{
								color: popoverOpen ? '#7C5CFF' : 'text.secondary',
								bgcolor: popoverOpen ? alpha('#7C5CFF', 0.12) : 'transparent',
								'&:hover': {
									bgcolor: alpha('#7C5CFF', 0.15),
									color: '#7C5CFF',
								},
							}}
						>
							<Badge
								badgeContent={unreadCount}
								color="error"
								invisible={unreadCount === 0}
								sx={{
									'& .MuiBadge-badge': {
										fontSize: '0.6rem',
										height: 14,
										minWidth: 14,
										fontWeight: 700,
									},
								}}
							>
								<NotificationsRoundedIcon fontSize="small" />
							</Badge>
						</IconButton>
					</Tooltip>

					{/* Popover */}
					<Popover
						open={popoverOpen}
						anchorEl={anchorEl}
						onClose={handleClose}
						anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
						transformOrigin={{ vertical: 'top', horizontal: 'right' }}
						slotProps={{
							paper: {
								sx: {
									width: 360,
									maxHeight: 460,
									mt: 1,
									bgcolor: '#222222',
									border: '1px solid',
									borderColor: alpha('#fff', 0.08),
									borderRadius: 2,
								},
							},
						}}
					>
						{/* Header */}
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								px: 2,
								py: 1.5,
							}}
						>
							<Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
								Notifications
							</Typography>
							{unreadCount > 0 && (
								<Button
									size="small"
									onClick={markAllAsRead}
									startIcon={<DoneAllRoundedIcon sx={{ fontSize: '14px !important' }} />}
									sx={{
										textTransform: 'none',
										fontSize: '0.7rem',
										color: 'text.secondary',
									}}
								>
									Tout lire
								</Button>
							)}
						</Box>
						<Divider />

						{/* List */}
						<Box sx={{ maxHeight: 340, overflow: 'auto' }}>
							{recentNotifs.length === 0 ? (
								<Box sx={{ py: 4, textAlign: 'center' }}>
									<Typography variant="caption" sx={{ color: 'text.disabled' }}>
										Aucune notification
									</Typography>
								</Box>
							) : (
								recentNotifs.map((notif) => (
									<Box
										key={notif.id}
										onClick={() => handleClickNotif(notif)}
										sx={{
											display: 'flex',
											gap: 1.5,
											px: 2,
											py: 1.25,
											cursor: 'pointer',
											bgcolor: notif.read ? 'transparent' : alpha('#7C5CFF', 0.04),
											'&:hover': { bgcolor: alpha('#fff', 0.04) },
											borderBottom: '1px solid',
											borderColor: alpha('#fff', 0.04),
										}}
									>
										<Box sx={{ mt: 0.25, flexShrink: 0 }}>
											{getNotifIcon(notif.type)}
										</Box>
										<Box sx={{ flex: 1, minWidth: 0 }}>
											<Typography
												sx={{
													fontSize: '0.78rem',
													fontWeight: notif.read ? 400 : 600,
													lineHeight: 1.3,
													mb: 0.25,
												}}
											>
												{notif.title}
											</Typography>
											{notif.message && (
												<Typography
													variant="caption"
													sx={{
														color: 'text.secondary',
														fontSize: '0.7rem',
														display: '-webkit-box',
														WebkitLineClamp: 2,
														WebkitBoxOrient: 'vertical',
														overflow: 'hidden',
													}}
												>
													{notif.message}
												</Typography>
											)}
											<Typography
												variant="caption"
												sx={{ color: 'text.disabled', fontSize: '0.65rem', mt: 0.25, display: 'block' }}
											>
												{formatNotifTime(notif.created_at)}
											</Typography>
										</Box>
										{!notif.read && (
											<Box
												sx={{
													width: 6,
													height: 6,
													borderRadius: '50%',
													bgcolor: '#7C5CFF',
													flexShrink: 0,
													mt: 0.75,
												}}
											/>
										)}
									</Box>
								))
							)}
						</Box>

						{/* Footer */}
						<Divider />
						<Box sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
							<Button
								size="small"
								onClick={handleSeeAll}
								sx={{
									textTransform: 'none',
									fontSize: '0.75rem',
									color: '#7C5CFF',
									fontWeight: 600,
								}}
							>
								Voir tout
							</Button>
						</Box>
					</Popover>

					{/* Agents toggle */}
					<Tooltip title={open ? 'Hide agents' : 'Show agents'}>
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
