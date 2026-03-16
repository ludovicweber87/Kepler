'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useDashboardTodos } from '@/hooks/useDashboardTodos';
import DashboardWidget from './DashboardWidget';

interface TodosWidgetProps {
	pendingCount: number;
}

export default function TodosWidget({ pendingCount }: TodosWidgetProps) {
	const theme = useTheme();
	const t = useTranslations('dashboard');
	const router = useRouter();
	const { todos, toggleTodo } = useDashboardTodos();

	const repoShortName = (fullName: string) => {
		const parts = fullName.split('/');
		return parts[parts.length - 1];
	};

	return (
		<DashboardWidget
			title={t('todosTitle')}
			badge={pendingCount > 0 ? t('pending', { count: pendingCount }) : undefined}
			linkText={t('viewAll')}
			onLinkClick={() => router.push('/todos')}
		>
			{todos.length === 0 ? (
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						py: 3,
						gap: 1,
					}}
				>
					<ChecklistRoundedIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
					<Typography variant="caption" sx={{ color: 'text.disabled' }}>
						{t('noTodos')}
					</Typography>
				</Box>
			) : (
				<Box sx={{ display: 'flex', flexDirection: 'column' }}>
					{todos.map((todo, index) => (
						<Box
							key={todo.id}
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 0.5,
								py: 0.75,
								borderBottom: index < todos.length - 1 ? 1 : 0,
								borderColor: 'divider',
							}}
						>
							<Checkbox
								size="small"
								checked={todo.done}
								onChange={() => toggleTodo(todo.id, !todo.done)}
								sx={{
									p: 0.25,
									color: alpha(theme.palette.text.disabled, 0.3),
									'&.Mui-checked': { color: 'primary.main' },
								}}
							/>
							<Typography
								sx={{
									fontSize: '0.78rem',
									flex: 1,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									textDecoration: todo.done ? 'line-through' : 'none',
									color: todo.done ? 'text.disabled' : 'text.primary',
								}}
							>
								{todo.title}
							</Typography>
							<Chip
								label={repoShortName(todo.repo_full_name)}
								size="small"
								sx={{
									height: 18,
									fontSize: '0.58rem',
									fontWeight: 500,
									bgcolor: alpha(theme.palette.text.disabled, 0.08),
									color: 'text.disabled',
								}}
							/>
						</Box>
					))}
				</Box>
			)}
		</DashboardWidget>
	);
}
