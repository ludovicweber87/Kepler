'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { alpha } from '@mui/material/styles';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import CircleRoundedIcon from '@mui/icons-material/CircleRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import { useNotifications } from '@/hooks/useNotifications';
import type { Notification } from '@/types';

function formatNotifDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function getNotifIcon(type: string) {
	if (type === 'report_published')
		return <PublishRoundedIcon sx={{ fontSize: 20, color: '#7C5CFF' }} />;
	return <CircleRoundedIcon sx={{ fontSize: 14, color: '#7C5CFF' }} />;
}

export default function NotificationsList() {
	const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications();
	const router = useRouter();
	const [activeTab, setActiveTab] = useState(0);

	// Derive unique view names for tabs
	const viewTabs = useMemo(() => {
		const views = new Set<string>();
		for (const n of notifications) {
			if (n.view_name) views.add(n.view_name);
		}
		return ['Toutes', ...Array.from(views).sort()];
	}, [notifications]);

	// Filter by selected tab
	const filtered = useMemo(() => {
		if (activeTab === 0) return notifications;
		const viewName = viewTabs[activeTab];
		return notifications.filter((n) => n.view_name === viewName);
	}, [notifications, activeTab, viewTabs]);

	// Group by date
	const grouped = useMemo(() => {
		const groups = new Map<string, Notification[]>();
		for (const n of filtered) {
			const day = new Date(n.created_at).toLocaleDateString('fr-FR', {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
			});
			if (!groups.has(day)) groups.set(day, []);
			groups.get(day)!.push(n);
		}
		return Array.from(groups.entries());
	}, [filtered]);

	const handleClick = (notif: Notification) => {
		if (!notif.read) markAsRead(notif.id);
		if (notif.issue_owner && notif.issue_repo && notif.issue_number) {
			router.push(`/task/${notif.issue_owner}/${notif.issue_repo}/${notif.issue_number}`);
		}
	};

	if (isLoading) {
		return (
			<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
				<CircularProgress size={28} sx={{ color: '#7C5CFF' }} />
			</Box>
		);
	}

	return (
		<Box sx={{ maxWidth: 720, mx: 'auto' }}>
			{/* Header */}
			<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
				<Typography
					variant="h4"
					sx={{
						fontWeight: 700,
						background: 'linear-gradient(135deg, #7C5CFF 0%, #9A84FF 30%, #00D4FF 100%)',
						backgroundClip: 'text',
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					Notifications
				</Typography>
				{unreadCount > 0 && (
					<Button
						size="small"
						onClick={markAllAsRead}
						startIcon={<DoneAllRoundedIcon sx={{ fontSize: '16px !important' }} />}
						sx={{ textTransform: 'none', fontSize: '0.78rem', color: 'text.secondary' }}
					>
						Tout marquer comme lu
					</Button>
				)}
			</Box>

			{/* Tabs */}
			{viewTabs.length > 1 && (
				<Tabs
					value={activeTab}
					onChange={(_, v) => setActiveTab(v)}
					variant="scrollable"
					scrollButtons="auto"
					sx={{
						mb: 3,
						minHeight: 36,
						'& .MuiTab-root': {
							textTransform: 'none',
							fontWeight: 600,
							fontSize: '0.8rem',
							minHeight: 36,
							py: 0,
						},
						'& .Mui-selected': { color: '#7C5CFF' },
						'& .MuiTabs-indicator': { bgcolor: '#7C5CFF' },
					}}
				>
					{viewTabs.map((tab) => (
						<Tab key={tab} label={tab} />
					))}
				</Tabs>
			)}

			{/* Notifications list */}
			{filtered.length === 0 ? (
				<Box sx={{ textAlign: 'center', py: 8 }}>
					<Typography variant="body2" sx={{ color: 'text.disabled' }}>
						Aucune notification
					</Typography>
				</Box>
			) : (
				grouped.map(([day, notifs]) => (
					<Box key={day} sx={{ mb: 3 }}>
						<Typography
							variant="caption"
							sx={{
								color: 'text.disabled',
								fontSize: '0.7rem',
								fontWeight: 600,
								textTransform: 'capitalize',
								mb: 1,
								display: 'block',
							}}
						>
							{day}
						</Typography>
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
							{notifs.map((notif) => (
								<Card
									key={notif.id}
									onClick={() => handleClick(notif)}
									sx={{
										display: 'flex',
										gap: 1.5,
										p: 1.5,
										cursor: 'pointer',
										bgcolor: notif.read ? 'background.paper' : alpha('#7C5CFF', 0.05),
										border: '1px solid',
										borderColor: notif.read
											? alpha('#fff', 0.06)
											: alpha('#7C5CFF', 0.15),
										transition: 'all 0.15s',
										'&:hover': {
											bgcolor: alpha('#fff', 0.04),
											borderColor: alpha('#7C5CFF', 0.25),
										},
									}}
								>
									<Box sx={{ mt: 0.25, flexShrink: 0 }}>{getNotifIcon(notif.type)}</Box>
									<Box sx={{ flex: 1, minWidth: 0 }}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
											<Typography
												sx={{
													fontSize: '0.82rem',
													fontWeight: notif.read ? 400 : 600,
													lineHeight: 1.3,
												}}
											>
												{notif.title}
											</Typography>
											{!notif.read && (
												<Box
													sx={{
														width: 6,
														height: 6,
														borderRadius: '50%',
														bgcolor: '#7C5CFF',
														flexShrink: 0,
													}}
												/>
											)}
										</Box>
										{notif.message && (
											<Typography
												variant="body2"
												sx={{
													color: 'text.secondary',
													fontSize: '0.75rem',
													mb: 0.5,
													lineHeight: 1.4,
												}}
											>
												{notif.message}
											</Typography>
										)}
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
											<Typography
												variant="caption"
												sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
											>
												{formatNotifDate(notif.created_at)}
											</Typography>
											{notif.view_name && (
												<Chip
													label={notif.view_name}
													size="small"
													sx={{
														height: 18,
														fontSize: '0.6rem',
														bgcolor: alpha('#7C5CFF', 0.1),
														color: alpha('#7C5CFF', 0.8),
													}}
												/>
											)}
											{notif.issue_repo && notif.issue_number && (
												<Typography
													variant="caption"
													sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
												>
													{notif.issue_repo}#{notif.issue_number}
												</Typography>
											)}
										</Box>
									</Box>
								</Card>
							))}
						</Box>
					</Box>
				))
			)}
		</Box>
	);
}
