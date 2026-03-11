'use client';

import { useRef, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';

export interface TabItem {
	key: string;
	label: ReactNode;
}

interface DraggableTabsProps {
	tabs: (string | TabItem)[];
	activeTab: number;
	onTabChange: (index: number) => void;
	onReorder: (newOrder: string[]) => void;
	counts?: number[];
	/** Accent color — defaults to #7C5CFF */
	color?: string;
	/** Trailing element (e.g. Add button) */
	trailing?: ReactNode;
	/** Override bottom margin (defaults to 3) */
	mb?: number;
	/** Extra sx for the container */
	sx?: SxProps<Theme>;
}

function getKey(tab: string | TabItem): string {
	return typeof tab === 'string' ? tab : tab.key;
}

function getLabel(tab: string | TabItem): ReactNode {
	return typeof tab === 'string' ? tab : tab.label;
}

export default function DraggableTabs({
	tabs,
	activeTab,
	onTabChange,
	onReorder,
	counts,
	color = '#7C5CFF',
	trailing,
	mb = 3,
	sx: sxOverride,
}: DraggableTabsProps) {
	const dragIdx = useRef<number | null>(null);
	const [dropTarget, setDropTarget] = useState<number | null>(null);

	const handleDragStart = (idx: number) => (e: React.DragEvent) => {
		dragIdx.current = idx;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', String(idx));
	};

	const handleDragOver = (idx: number) => (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		if (dragIdx.current !== null && dragIdx.current !== idx) {
			setDropTarget(idx);
		}
	};

	const handleDrop = (idx: number) => (e: React.DragEvent) => {
		e.preventDefault();
		setDropTarget(null);
		const from = dragIdx.current;
		if (from === null || from === idx) return;
		const keys = tabs.map(getKey);
		const newKeys = [...keys];
		const [moved] = newKeys.splice(from, 1);
		newKeys.splice(idx, 0, moved);
		const activeKey = keys[activeTab];
		const newActiveIdx = newKeys.indexOf(activeKey);
		onReorder(newKeys);
		if (newActiveIdx !== activeTab) {
			onTabChange(newActiveIdx);
		}
		dragIdx.current = null;
	};

	const handleDragEnd = () => {
		dragIdx.current = null;
		setDropTarget(null);
	};

	return (
		<Box
			sx={[
				{
					display: 'flex',
					alignItems: 'center',
					gap: 0.5,
					mb,
					overflowX: 'auto',
					'&::-webkit-scrollbar': { display: 'none' },
				},
				...(Array.isArray(sxOverride) ? sxOverride : sxOverride ? [sxOverride] : []),
			]}
		>
			{tabs.map((tab, idx) => {
				const isActive = idx === activeTab;
				const isDropTarget = dropTarget === idx;
				return (
					<Box
						key={getKey(tab)}
						draggable
						onDragStart={handleDragStart(idx)}
						onDragOver={handleDragOver(idx)}
						onDrop={handleDrop(idx)}
						onDragEnd={handleDragEnd}
						onClick={() => onTabChange(idx)}
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 0.75,
							px: 2,
							py: 1,
							borderRadius: 1,
							cursor: 'grab',
							userSelect: 'none',
							whiteSpace: 'nowrap',
							fontSize: '0.85rem',
							fontWeight: 500,
							transition: 'background-color 0.15s, transform 0.15s, box-shadow 0.15s',
							bgcolor: isActive ? alpha(color, 0.18) : 'transparent',
							color: isActive ? color : 'text.secondary',
							border: 1,
							borderColor: isDropTarget
								? alpha(color, 0.5)
								: isActive
									? alpha(color, 0.25)
									: 'transparent',
							'&:hover': {
								bgcolor: alpha(color, isActive ? 0.22 : 0.08),
							},
							'&:active': {
								cursor: 'grabbing',
								transform: 'scale(0.97)',
							},
						}}
					>
						{getLabel(tab)}
						{counts && counts[idx] !== undefined && (
							<Box
								component="span"
								sx={{
									fontSize: '0.7rem',
									fontWeight: 600,
									bgcolor: alpha(color, 0.15),
									color: isActive ? color : 'text.secondary',
									borderRadius: 1,
									px: 0.75,
									py: 0.15,
									minWidth: 18,
									textAlign: 'center',
								}}
							>
								{counts[idx]}
							</Box>
						)}
					</Box>
				);
			})}
			{trailing}
		</Box>
	);
}
