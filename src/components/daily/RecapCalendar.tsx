'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTranslations } from 'next-intl';
import { buildMonthGrid, parseMonth, shiftMonth, toKey } from '@/lib/monthGrid';

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function RecapCalendar({
	month,
	recapDays,
	onPickDay,
	onMonthChange,
	onGenerate,
	generatingDate,
}: {
	month: string;
	recapDays: Set<string>;
	onPickDay: (date: Date) => void;
	onMonthChange: (month: string) => void;
	onGenerate: (dateKey: string) => void;
	generatingDate?: string | null;
}) {
	const t = useTranslations('daily');
	const weeks = buildMonthGrid(month);
	const todayKey = toKey(new Date());
	const monthTitle = capitalize(format(parseMonth(month), 'LLLL yyyy', { locale: fr }));
	const weekdayLabels = weeks[0].map((d) => capitalize(format(d.date, 'EEEEEE', { locale: fr })));

	return (
		<Box>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
				<IconButton
					size="small"
					aria-label={t('prevMonth')}
					onClick={() => onMonthChange(shiftMonth(month, -1))}
				>
					<ChevronLeftRoundedIcon />
				</IconButton>
				<Typography variant="h6" sx={{ fontWeight: 600, minWidth: 160 }}>
					{monthTitle}
				</Typography>
				<IconButton
					size="small"
					aria-label={t('nextMonth')}
					onClick={() => onMonthChange(shiftMonth(month, 1))}
				>
					<ChevronRightRoundedIcon />
				</IconButton>
			</Box>

			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: 'repeat(7, 1fr)',
					gap: 1,
					mb: 1,
				}}
			>
				{weekdayLabels.map((label, i) => (
					<Typography
						key={i}
						variant="caption"
						sx={{
							textAlign: 'center',
							color: 'text.secondary',
							textTransform: 'uppercase',
							letterSpacing: '0.5px',
							fontWeight: 600,
						}}
					>
						{label}
					</Typography>
				))}
			</Box>

			<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
				{weeks.flat().map((day) => {
					const isToday = day.key === todayKey;
					const isFuture = day.key > todayKey;
					const hasRecap = day.inMonth && recapDays.has(day.key);
					const isGenerating = generatingDate === day.key;
					const canGenerate = day.inMonth && !isFuture;

					return (
						<Box
							key={day.key}
							onClick={day.inMonth ? () => onPickDay(day.date) : undefined}
							sx={{
								position: 'relative',
								aspectRatio: '1 / 1',
								borderRadius: 2,
								border: 2,
								borderColor: isToday ? 'primary.main' : 'divider',
								bgcolor: 'background.paper',
								opacity: day.inMonth ? 1 : 0.4,
								cursor: day.inMonth ? 'pointer' : 'default',
								overflow: 'hidden',
								transition: 'border-color 0.15s, box-shadow 0.15s',
								'&:hover': day.inMonth ? { boxShadow: 3 } : {},
								'&:hover .day-overlay': canGenerate ? { opacity: 1 } : {},
							}}
						>
							<Typography
								sx={{
									position: 'absolute',
									top: 8,
									left: 10,
									fontSize: 14,
									fontWeight: 600,
									color: isToday ? 'primary.main' : 'text.primary',
								}}
							>
								{format(day.date, 'd')}
							</Typography>

							{hasRecap && (
								<Box
									sx={{
										position: 'absolute',
										bottom: 10,
										left: 12,
										width: 6,
										height: 6,
										borderRadius: '50%',
										bgcolor: 'primary.main',
									}}
								/>
							)}

							{canGenerate && (
								<Box
									className="day-overlay"
									sx={{
										position: 'absolute',
										inset: 0,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										bgcolor: (theme) => `${theme.palette.primary.main}1F`,
										opacity: isGenerating ? 1 : 0,
										transition: 'opacity 0.15s',
									}}
								>
									{isGenerating ? (
										<CircularProgress size={22} />
									) : (
										<Button
											variant="contained"
											size="small"
											startIcon={<AutoAwesomeRoundedIcon />}
											onClick={(e) => {
												e.stopPropagation();
												onGenerate(day.key);
											}}
											sx={{ textTransform: 'none', fontWeight: 600 }}
										>
											{hasRecap ? t('regenerate') : t('generate')}
										</Button>
									)}
								</Box>
							)}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}
