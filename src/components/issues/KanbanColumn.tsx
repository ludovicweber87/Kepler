'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import IssueCard from './IssueCard';
import { GitHubIssue } from '@/types';

const COLUMN_WIDTH = 300;

interface KanbanColumnProps {
	columnName: string;
	issues: GitHubIssue[];
	allColumns: string[];
	onStatusChange: (issue: GitHubIssue, newStatus: string) => void;
	onCardClick: (issue: GitHubIssue) => void;
}

export default function KanbanColumn({
	columnName,
	issues,
	allColumns,
	onStatusChange,
	onCardClick,
}: KanbanColumnProps) {
	const theme = useTheme();
	const count = issues.length;

	return (
		<Box
			sx={{
				width: COLUMN_WIDTH,
				minWidth: COLUMN_WIDTH,
				flexShrink: 0,
				display: 'flex',
				flexDirection: 'column',
				bgcolor: 'background.paper',
				borderRadius: 1,
				boxShadow:
					theme.palette.mode === 'dark'
						? `0 1px 4px ${alpha(theme.palette.common.black, 0.18)}, 0 0 1px ${alpha(theme.palette.common.black, 0.25)}`
						: `0 1px 4px ${alpha(theme.palette.common.black, 0.06)}, 0 0 1px ${alpha(theme.palette.common.black, 0.1)}`,
				p: 1.5,
			}}
		>
			{/* Column header */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					mb: 1.5,
				}}
			>
				<Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
					{columnName}
				</Typography>
				<Chip
					label={count}
					size="small"
					sx={{
						height: 20,
						minWidth: 20,
						fontSize: '0.7rem',
						fontWeight: 700,
						bgcolor: alpha(theme.palette.primary.main, 0.12),
						color: 'primary.light',
					}}
				/>
			</Box>

			{/* Column body */}
			<Box
				sx={{
					display: 'flex',
					flexDirection: 'column',
					gap: 1,
					overflowY: 'auto',
					height: 'calc(100vh - 250px)',
					scrollbarWidth: 'thin',
					'&::-webkit-scrollbar': { width: 4 },
					'&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 1 },
					// Empêche flexbox d'écraser les cards quand la colonne déborde : on scrolle à la place
					'& > *': { flexShrink: 0 },
				}}
			>
				{issues.map((issue) => (
					<IssueCard
						key={issue.node_id}
						issue={issue}
						currentColumn={columnName}
						columns={allColumns}
						onStatusChange={onStatusChange}
						onOpen={onCardClick}
					/>
				))}
			</Box>
		</Box>
	);
}
