'use client';

import { Box, ListItemButton, Typography } from '@mui/material';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { dbTimestampToDate, titleFor } from '@/lib/notificationsReducer';
import { SourceIcon } from './sourceIcon';
import type { AppNotification } from '@/types';

const RTF_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
	['year', 60 * 60 * 24 * 365],
	['month', 60 * 60 * 24 * 30],
	['week', 60 * 60 * 24 * 7],
	['day', 60 * 60 * 24],
	['hour', 60 * 60],
	['minute', 60],
];

/** Minimal relative-time formatter (date-fns isn't installed in this repo — see
 * package.json vs node_modules mismatch). Uses the built-in Intl.RelativeTimeFormat,
 * which needs no extra dependency and already carries locale-aware wording. */
function relativeTime(isoDate: string, locale: string): string {
	const date = dbTimestampToDate(isoDate);
	if (Number.isNaN(date.getTime())) return '';
	const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

	for (const [unit, secondsInUnit] of RTF_UNITS) {
		if (Math.abs(diffSeconds) >= secondsInUnit) {
			return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
		}
	}
	return rtf.format(diffSeconds, 'second');
}

export function NotificationItem({
	n,
	onRead,
}: {
	n: AppNotification;
	onRead: (id: string) => void;
}) {
	const t = useTranslations('notifications');
	const locale = useLocale();
	const router = useRouter();
	const title = titleFor(n, (k, v) => t(k, v));

	const handleClick = () => {
		onRead(n.id);
		if (!n.url) return;
		if (n.url.startsWith('/')) router.push(n.url);
		else window.open(n.url, '_blank', 'noopener');
	};

	return (
		<ListItemButton onClick={handleClick} sx={{ alignItems: 'flex-start', gap: 1.5, py: 1 }}>
			<Box sx={{ mt: 0.3, color: 'text.secondary' }}>
				<SourceIcon source={n.source} />
			</Box>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography variant="body2" sx={{ fontWeight: n.read_at ? 400 : 600 }} noWrap>
					{title}
				</Typography>
				{n.body ? (
					<Typography variant="caption" color="text.secondary" noWrap component="div">
						{n.body}
					</Typography>
				) : null}
				<Typography variant="caption" color="text.secondary" component="div">
					{relativeTime(n.created_at, locale)}
				</Typography>
			</Box>
			{!n.read_at && (
				<Box
					sx={{
						mt: 0.8,
						width: 8,
						height: 8,
						borderRadius: '50%',
						bgcolor: 'primary.main',
						flexShrink: 0,
					}}
				/>
			)}
		</ListItemButton>
	);
}
