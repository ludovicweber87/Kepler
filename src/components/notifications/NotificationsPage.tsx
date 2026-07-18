'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import { useTranslations } from 'next-intl';
import { useNotifications } from '@/hooks/useNotifications';
import { useMarkNotifications } from '@/hooks/useMarkNotifications';
import { groupByDay } from '@/lib/notificationsReducer';
import { NotificationItem } from './NotificationItem';
import type { NotificationSource } from '@/types';

type Filter = 'all' | NotificationSource;

export function NotificationsPage() {
	const t = useTranslations('notifications');
	const { notifications } = useNotifications();
	const { markRead, markAllRead } = useMarkNotifications();
	const [filter, setFilter] = useState<Filter>('all');

	const filtered =
		filter === 'all' ? notifications : notifications.filter((n) => n.source === filter);
	const groups = groupByDay(filtered);
	const filters: { key: Filter; label: string }[] = [
		{ key: 'all', label: t('filterAll') },
		{ key: 'agent', label: t('filterAgents') },
		{ key: 'ci', label: t('filterCi') },
		{ key: 'github', label: t('filterGithub') },
		{ key: 'pr', label: t('filterPr') },
	];

	return (
		<Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					mb: 2,
				}}
			>
				<Typography variant="h5">{t('title')}</Typography>
				<Button size="small" onClick={() => markAllRead()}>
					{t('markAllRead')}
				</Button>
			</Box>
			<Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
				{filters.map((f) => (
					<Chip
						key={f.key}
						label={f.label}
						color={filter === f.key ? 'primary' : 'default'}
						onClick={() => setFilter(f.key)}
						size="small"
					/>
				))}
			</Stack>
			{groups.length === 0 ? (
				<Typography color="text.secondary">{t('empty')}</Typography>
			) : (
				groups.map((g) => (
					<Box key={g.day} sx={{ mb: 2 }}>
						<Typography variant="caption" color="text.secondary">
							{g.day}
						</Typography>
						<Divider sx={{ my: 0.5 }} />
						<List dense disablePadding>
							{g.items.map((n) => (
								<NotificationItem
									key={n.id}
									n={n}
									onRead={(id) => markRead([id])}
								/>
							))}
						</List>
					</Box>
				))
			)}
		</Box>
	);
}
