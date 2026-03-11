'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import IssueCard from './IssueCard';
import { GitHubIssue } from '@/types';

const COLUMN_WIDTH = 300;
const springTransition = { type: 'spring' as const, stiffness: 500, damping: 35 };

interface KanbanColumnProps {
	columnName: string;
	issues: GitHubIssue[];
	isDragActive: boolean;
	draggedIssueId: number | null;
	isDropTarget: boolean;
	dropIndex: number;
	onCardDragStart: (issue: GitHubIssue) => void;
	onCardDrag: (event: PointerEvent, info: PanInfo) => void;
	onCardDragEnd: (event: PointerEvent, info: PanInfo) => void;
}

const KanbanColumn = forwardRef<HTMLDivElement, KanbanColumnProps>(function KanbanColumn(
	{
		columnName,
		issues,
		isDragActive,
		draggedIssueId,
		isDropTarget,
		dropIndex,
		onCardDragStart,
		onCardDrag,
		onCardDragEnd,
	},
	ref,
) {
	const count = issues.length;

	const elements: React.ReactNode[] = [];

	issues.forEach((issue, i) => {
		if (isDropTarget && dropIndex === i) {
			elements.push(
				<motion.div
					key="placeholder"
					data-placeholder="true"
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: 80, opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={springTransition}
					style={{
						borderRadius: 1,
						border: '2px dashed rgba(124, 77, 255, 0.3)',
						background: 'rgba(124, 77, 255, 0.06)',
						flexShrink: 0,
					}}
				/>,
			);
		}

		elements.push(
			<IssueCard
				key={issue.id}
				issue={issue}
				isDraggable
				isDragging={draggedIssueId === issue.id}
				onDragStart={() => onCardDragStart(issue)}
				onDrag={onCardDrag}
				onDragEnd={onCardDragEnd}
			/>,
		);
	});

	if (isDropTarget && dropIndex >= issues.length) {
		elements.push(
			<motion.div
				key="placeholder"
				data-placeholder="true"
				initial={{ height: 0, opacity: 0 }}
				animate={{ height: 80, opacity: 1 }}
				exit={{ height: 0, opacity: 0 }}
				transition={springTransition}
				style={{
					borderRadius: 1,
					border: '2px dashed rgba(124, 77, 255, 0.3)',
					background: 'rgba(124, 77, 255, 0.06)',
					flexShrink: 0,
				}}
			/>,
		);
	}

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
				boxShadow: (t: { palette: { mode: string } }) =>
					t.palette.mode === 'dark'
						? `0 1px 4px ${alpha('#000', 0.18)}, 0 0 1px ${alpha('#000', 0.25)}`
						: `0 1px 4px ${alpha('#000', 0.06)}, 0 0 1px ${alpha('#000', 0.1)}`,
				p: 1.5,
				transition: 'box-shadow 0.2s',
				...(isDropTarget && {
					boxShadow: `0 2px 8px ${alpha('#7C5CFF', 0.2)}, 0 0 1px ${alpha('#7C5CFF', 0.4)}`,
				}),
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
						bgcolor: alpha('#7C5CFF', 0.12),
						color: '#9A84FF',
					}}
				/>
			</Box>

			{/* Column body */}
			<Box
				ref={ref}
				sx={{
					display: 'flex',
					flexDirection: 'column',
					gap: 1,
					overflowY: isDragActive ? 'visible' : 'auto',
					height: 'calc(100vh - 250px)',
					scrollbarWidth: 'thin',
					'&::-webkit-scrollbar': { width: 4 },
					'&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 1 },
					transition: 'background 0.2s',
					...(isDropTarget && {
						background: alpha('#7C5CFF', 0.04),
					}),
				}}
			>
				<AnimatePresence mode="popLayout">{elements}</AnimatePresence>
			</Box>
		</Box>
	);
});

export default KanbanColumn;
