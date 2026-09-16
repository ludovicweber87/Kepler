'use client';

import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { appShadow } from '@/theme/shadows';
import type { MentionItem } from '@/hooks/useMentionMenu';

/** Au-delà, la liste défile : elle ne doit jamais manger la conversation. */
const MAX_HEIGHT = 280;

interface Props {
	open: boolean;
	anchorEl: HTMLElement | null;
	items: MentionItem[];
	activeIndex: number;
	/** Identifiant du listbox, référencé par `aria-controls` sur le champ. */
	id: string;
	label: string;
	onHover: (index: number) => void;
	onSelect: (index: number) => void;
}

export default function MentionPopover({
	open,
	anchorEl,
	items,
	activeIndex,
	id,
	label,
	onHover,
	onSelect,
}: Props) {
	const activeRef = useRef<HTMLDivElement>(null);

	// Navigation au clavier : l'option sélectionnée doit rester visible sans
	// déplacer la page autour (`block: 'nearest'`).
	useEffect(() => {
		activeRef.current?.scrollIntoView({ block: 'nearest' });
	}, [activeIndex, open]);

	return (
		<Popper
			open={open}
			anchorEl={anchorEl}
			placement="top-start"
			// Le composer est collé au bas du panneau : sans ça, popper retournerait
			// la liste vers le bas, hors écran, dès qu'elle devient longue.
			modifiers={[{ name: 'flip', enabled: false }]}
			style={{ width: anchorEl?.clientWidth, zIndex: 1300 }}
		>
			<Paper
				// Le clic ne doit pas sortir le focus du textarea : sans ce garde, le
				// blur repositionne le caret et l'insertion se fait au mauvais endroit.
				onMouseDown={(e) => e.preventDefault()}
				sx={{
					mb: 0.75,
					overflowY: 'auto',
					maxHeight: MAX_HEIGHT,
					border: '1px solid',
					borderColor: 'divider',
					borderRadius: 2,
					boxShadow: (th) => appShadow(th.palette.mode),
				}}
			>
				<Box role="listbox" id={id} aria-label={label}>
					{items.map((item, index) => {
						const selected = index === activeIndex;
						return (
							<Box
								key={item.value}
								id={`${id}-option-${index}`}
								ref={selected ? activeRef : undefined}
								role="option"
								aria-selected={selected}
								onMouseEnter={() => onHover(index)}
								onClick={() => onSelect(index)}
								sx={{
									display: 'flex',
									alignItems: 'baseline',
									gap: 1,
									px: 1.25,
									py: 0.6,
									cursor: 'pointer',
									bgcolor: selected
										? (th) => alpha(th.palette.primary.main, 0.12)
										: 'transparent',
								}}
							>
								<Typography
									variant="caption"
									sx={{
										fontSize: '0.78rem',
										fontWeight: 600,
										fontFamily: 'monospace',
										whiteSpace: 'nowrap',
									}}
								>
									{item.label}
								</Typography>
								{item.argumentHint && (
									<Typography
										variant="caption"
										sx={{
											fontSize: '0.7rem',
											fontFamily: 'monospace',
											color: 'text.disabled',
											whiteSpace: 'nowrap',
										}}
									>
										{item.argumentHint}
									</Typography>
								)}
								{item.detail && (
									<Typography
										variant="caption"
										sx={{
											fontSize: '0.7rem',
											color: 'text.secondary',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
											minWidth: 0,
											ml: 'auto',
										}}
									>
										{item.detail}
									</Typography>
								)}
							</Box>
						);
					})}
				</Box>
			</Paper>
		</Popper>
	);
}
