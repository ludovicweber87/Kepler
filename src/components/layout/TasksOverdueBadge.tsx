'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import ListItemButton from '@mui/material/ListItemButton';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import UrgencyChip from '@/components/tasks/UrgencyChip';
import type { Task } from '@/types';

/** Au-delà, le popover deviendrait une seconde page Tasks. */
const MAX_ROWS = 6;
/** Laisse le temps de traverser le vide entre la pastille et le popover. */
const CLOSE_DELAY_MS = 120;

interface Props {
	/** Tasks en retard, déjà filtrées et triées par `selectOverdueTasks`. */
	tasks: Task[];
	now: Date;
}

export default function TasksOverdueBadge({ tasks, now }: Props) {
	const theme = useTheme();
	const t = useTranslations('tasks');
	const router = useRouter();
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const cancelClose = useCallback(() => {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current);
			closeTimer.current = null;
		}
	}, []);

	const scheduleClose = useCallback(() => {
		cancelClose();
		closeTimer.current = setTimeout(() => setAnchorEl(null), CLOSE_DELAY_MS);
	}, [cancelClose]);

	const handleEnter = useCallback(
		(event: MouseEvent<HTMLElement>) => {
			cancelClose();
			setAnchorEl(event.currentTarget);
		},
		[cancelClose],
	);

	useEffect(() => cancelClose, [cancelClose]);

	if (tasks.length === 0) return null;

	const visible = tasks.slice(0, MAX_ROWS);
	const hidden = tasks.length - visible.length;

	// La pastille vit dans le <Link> de l'item de menu : le clic navigue déjà
	// vers /tasks. Ici on ne gère que la fermeture du popover.
	const goToTasks = () => {
		cancelClose();
		setAnchorEl(null);
		router.push('/tasks');
	};

	return (
		<>
			<Box
				onMouseEnter={handleEnter}
				onMouseLeave={scheduleClose}
				sx={{
					minWidth: 18,
					height: 18,
					px: 0.5,
					borderRadius: '9px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					bgcolor: 'error.main',
					color: theme.palette.common.white,
					fontSize: '0.65rem',
					fontWeight: 700,
					lineHeight: 1,
					// Même pulsation que l'UrgencyChip overdue de la page Tasks.
					animation: 'taskPulse 1.6s ease-in-out infinite',
					'@keyframes taskPulse': {
						'0%, 100%': { opacity: 1 },
						'50%': { opacity: 0.55 },
					},
				}}
			>
				{tasks.length}
			</Box>

			<Popover
				open={Boolean(anchorEl)}
				anchorEl={anchorEl}
				onClose={scheduleClose}
				anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
				transformOrigin={{ vertical: 'center', horizontal: 'left' }}
				disableRestoreFocus
				// Popover piloté au survol : sans ça son backdrop invisible avalerait
				// le mouseleave de la pastille et il ne se fermerait jamais.
				sx={{ pointerEvents: 'none' }}
				slotProps={{
					paper: {
						onMouseEnter: cancelClose,
						onMouseLeave: scheduleClose,
						sx: {
							pointerEvents: 'auto',
							ml: 1,
							width: 280,
							p: 1,
							border: `1px solid ${theme.palette.divider}`,
						},
					},
				}}
			>
				<Typography
					sx={{
						px: 1,
						py: 0.5,
						fontSize: '0.7rem',
						fontWeight: 700,
						color: 'error.main',
						textTransform: 'uppercase',
						letterSpacing: 0.4,
					}}
				>
					{t('overdueBadgeTitle', { count: tasks.length })}
				</Typography>

				{visible.map((task) => (
					<ListItemButton
						key={task.id}
						onClick={goToTasks}
						sx={{
							borderRadius: 1,
							gap: 1,
							px: 1,
							py: 0.75,
							alignItems: 'center',
							'&:hover': { bgcolor: alpha(theme.palette.error.main, 0.1) },
						}}
					>
						<Box sx={{ minWidth: 0, flex: 1 }}>
							<Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 500 }}>
								{task.title}
							</Typography>
							{task.repo_full_name && (
								<Typography
									noWrap
									sx={{ fontSize: '0.65rem', color: 'text.secondary' }}
								>
									{task.repo_full_name}
								</Typography>
							)}
						</Box>
						<UrgencyChip dueDate={task.due_date} now={now} />
					</ListItemButton>
				))}

				{hidden > 0 && (
					<Typography
						sx={{
							px: 1,
							pt: 0.75,
							pb: 0.25,
							fontSize: '0.7rem',
							color: 'text.secondary',
						}}
					>
						{t('overdueMore', { count: hidden })}
					</Typography>
				)}
			</Popover>
		</>
	);
}
