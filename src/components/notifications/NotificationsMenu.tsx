'use client';

import { Menu, Box, Button, Divider, List, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications';
import { useMarkNotifications } from '@/hooks/useMarkNotifications';
import { NotificationItem } from './NotificationItem';

export function NotificationsMenu({
	anchorEl,
	onClose,
}: {
	anchorEl: HTMLElement | null;
	onClose: () => void;
}) {
	const t = useTranslations('notifications');
	const router = useRouter();
	const { notifications } = useNotifications();
	const { markRead, markAllRead } = useMarkNotifications();
	const recent = notifications.slice(0, 10);

	return (
		<Menu
			anchorEl={anchorEl}
			open={!!anchorEl}
			onClose={onClose}
			anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
			transformOrigin={{ vertical: 'top', horizontal: 'right' }}
			slotProps={{ paper: { sx: { width: 360, maxHeight: 480 } } }}
		>
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					px: 2,
					py: 1,
				}}
			>
				<Typography variant="subtitle2">{t('title')}</Typography>
				<Button size="small" onClick={() => markAllRead()}>
					{t('markAllRead')}
				</Button>
			</Box>
			<Divider />
			{recent.length === 0 ? (
				<Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
					{t('empty')}
				</Typography>
			) : (
				<List dense disablePadding>
					{recent.map((n) => (
						<NotificationItem
							key={n.id}
							n={n}
							onRead={(id) => {
								markRead([id]);
								onClose();
							}}
						/>
					))}
				</List>
			)}
			<Divider />
			<Button
				fullWidth
				onClick={() => {
					onClose();
					router.push('/notifications');
				}}
			>
				{t('seeAll')}
			</Button>
		</Menu>
	);
}
