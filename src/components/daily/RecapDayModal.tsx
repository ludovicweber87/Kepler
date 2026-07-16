'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import type { DailyRecap } from '@/types';

const markdownSx = {
	'& p': { my: 0.5, lineHeight: 1.6, color: 'text.secondary', fontSize: '0.85rem' },
	'& ul, & ol': { pl: 2.5, my: 0.5, color: 'text.secondary', fontSize: '0.85rem' },
	'& li': { mb: 0.25 },
	'& h1, & h2, & h3': { fontSize: '0.95rem', fontWeight: 600, mt: 1, mb: 0.5 },
	'& code': { fontFamily: 'monospace', fontSize: '0.8em' },
	'& a': { color: 'primary.light' },
};

function RecapCard({ recap, onDelete }: { recap: DailyRecap; onDelete: (id: string) => void }) {
	const t = useTranslations('daily');
	const [open, setOpen] = useState(false);
	const time = new Date(recap.created_at).toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
	});
	const items = recap.items ?? [];

	return (
		<Box
			sx={{
				border: 1,
				borderColor: 'divider',
				borderRadius: 2,
				p: 1.5,
				mb: 1.5,
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
				<Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
					{t('reportAt', { time })}
				</Typography>
				<Chip
					label={
						recap.trigger_type === 'scheduled' ? t('badgeScheduled') : t('badgeManual')
					}
					size="small"
					color={recap.trigger_type === 'scheduled' ? 'secondary' : 'default'}
					sx={{ fontSize: '0.65rem', height: 20 }}
				/>
				<Tooltip title={t('delete')}>
					<IconButton size="small" color="error" onClick={() => onDelete(recap.id)}>
						<DeleteOutlineRoundedIcon fontSize="small" />
					</IconButton>
				</Tooltip>
			</Box>

			<Box sx={markdownSx}>
				<ReactMarkdown remarkPlugins={[remarkGfm]}>{recap.content}</ReactMarkdown>
			</Box>

			{items.length > 0 && (
				<>
					<Button
						size="small"
						onClick={() => setOpen((v) => !v)}
						startIcon={
							<ExpandMoreRoundedIcon
								sx={{
									transform: open ? 'rotate(180deg)' : 'none',
									transition: 'transform 0.15s',
								}}
							/>
						}
						sx={{ textTransform: 'none', mt: 0.5, color: 'text.secondary' }}
					>
						{t('activityDetail')} ({items.length})
					</Button>
					<Collapse in={open} unmountOnExit>
						<Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
							{items.map((it, i) => (
								<Box
									key={i}
									sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}
								>
									<Typography
										variant="caption"
										sx={{
											fontFamily: 'monospace',
											color: 'text.disabled',
											minWidth: 42,
										}}
									>
										{it.time || '--:--'}
									</Typography>
									<Chip
										label={it.type}
										size="small"
										variant="outlined"
										sx={{ fontSize: '0.6rem', height: 18 }}
									/>
									<Typography
										variant="caption"
										sx={{ color: 'text.secondary', flex: 1 }}
									>
										{it.text}
									</Typography>
								</Box>
							))}
						</Box>
					</Collapse>
				</>
			)}
		</Box>
	);
}

export default function RecapDayModal({
	open,
	onClose,
	date,
	recaps,
	generating,
	onGenerate,
	onDelete,
}: {
	open: boolean;
	onClose: () => void;
	date: Date | null;
	recaps: DailyRecap[];
	generating: boolean;
	onGenerate: () => void;
	onDelete: (id: string) => void;
}) {
	const t = useTranslations('daily');
	const dateLabel = date
		? date.toLocaleDateString(undefined, {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			})
		: '';

	return (
		<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
			<DialogTitle sx={{ textTransform: 'capitalize' }}>
				{t('dayTitle', { date: dateLabel })}
			</DialogTitle>
			<DialogContent dividers>
				{recaps.length === 0 ? (
					<Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
						{t('noRecapsForDay')}
					</Typography>
				) : (
					recaps.map((r) => <RecapCard key={r.id} recap={r} onDelete={onDelete} />)
				)}
			</DialogContent>
			<DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 1.5 }}>
				<Button onClick={onClose} sx={{ textTransform: 'none' }}>
					{t('close')}
				</Button>
				<Button
					variant="contained"
					onClick={onGenerate}
					disabled={generating}
					startIcon={
						generating ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<AutoAwesomeRoundedIcon />
						)
					}
					sx={{ textTransform: 'none' }}
				>
					{generating ? t('generating') : t('generateForDay')}
				</Button>
			</DialogActions>
			<Divider />
		</Dialog>
	);
}
