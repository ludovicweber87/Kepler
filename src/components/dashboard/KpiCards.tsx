'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import MergeRoundedIcon from '@mui/icons-material/MergeRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import { useTranslations } from 'next-intl';

interface KpiCardData {
	icon: React.ReactNode;
	value: number;
	label: string;
	color: string;
}

interface KpiCardsProps {
	activeAgents: number;
	openIssues: number;
	pendingPrs: number;
	pendingTodos: number;
}

export default function KpiCards({
	activeAgents,
	openIssues,
	pendingPrs,
	pendingTodos,
}: KpiCardsProps) {
	const theme = useTheme();
	const t = useTranslations('dashboard');

	const cards: KpiCardData[] = [
		{
			icon: <SmartToyRoundedIcon sx={{ fontSize: 18 }} />,
			value: activeAgents,
			label: t('kpiAgents'),
			color: theme.palette.primary.main,
		},
		{
			icon: <BugReportRoundedIcon sx={{ fontSize: 18 }} />,
			value: openIssues,
			label: t('kpiIssues'),
			color: theme.palette.secondary.main,
		},
		{
			icon: <MergeRoundedIcon sx={{ fontSize: 18 }} />,
			value: pendingPrs,
			label: t('kpiPrs'),
			color: theme.palette.success.main,
		},
		{
			icon: <ChecklistRoundedIcon sx={{ fontSize: 18 }} />,
			value: pendingTodos,
			label: t('kpiTodos'),
			color: theme.palette.warning.main,
		},
	];

	return (
		<Box
			sx={{
				display: 'grid',
				gridTemplateColumns: 'repeat(4, 1fr)',
				gap: 1.5,
			}}
		>
			{cards.map((card) => (
				<Box
					key={card.label}
					sx={{
						bgcolor: 'background.paper',
						borderRadius: '10px',
						border: 1,
						borderColor: 'divider',
						p: 2,
						transition: 'all 0.2s',
						'&:hover': {
							borderColor: alpha(card.color, 0.3),
							transform: 'translateY(-1px)',
						},
					}}
				>
					<Box
						sx={{
							width: 36,
							height: 36,
							borderRadius: '8px',
							bgcolor: alpha(card.color, 0.12),
							color: card.color,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							mb: 1.25,
						}}
					>
						{card.icon}
					</Box>
					<Typography
						sx={{
							fontSize: '1.75rem',
							fontWeight: 700,
							lineHeight: 1,
							color: card.color,
							mb: 0.5,
						}}
					>
						{card.value}
					</Typography>
					<Typography
						sx={{
							fontSize: '0.68rem',
							color: 'text.disabled',
							textTransform: 'uppercase',
							letterSpacing: 0.5,
							fontWeight: 500,
						}}
					>
						{card.label}
					</Typography>
				</Box>
			))}
		</Box>
	);
}
