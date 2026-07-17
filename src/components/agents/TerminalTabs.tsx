'use client';

import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import ShellTerminal, { type ShellTerminalHandle } from '@/components/agents/ShellTerminal';

interface TerminalTabsProps {
	sessionId: string;
	cwd: string | null;
	ready?: boolean;
	autoStart?: boolean;
}

export default function TerminalTabs({
	sessionId,
	cwd,
	ready = true,
	autoStart = true,
}: TerminalTabsProps) {
	const t = useTranslations('workbench');

	const [terminals, setTerminals] = useState<number[]>(autoStart ? [1] : []);
	const [activeId, setActiveId] = useState<number>(autoStart ? 1 : -1);
	const counter = useRef(autoStart ? 2 : 1);
	const handles = useRef<Map<number, ShellTerminalHandle>>(new Map());

	const addTerminal = useCallback(() => {
		const id = counter.current++;
		setTerminals((prev) => [...prev, id]);
		setActiveId(id);
	}, []);

	const closeTerminal = useCallback((id: number) => {
		handles.current.get(id)?.kill();
		handles.current.delete(id);
		setTerminals((prev) => {
			const next = prev.filter((x) => x !== id);
			setActiveId((current) => {
				if (current !== id) return current;
				const idx = prev.indexOf(id);
				return next[idx] ?? next[idx - 1] ?? next[0] ?? -1;
			});
			return next;
		});
	}, []);

	return (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
			{/* Barre d'onglets + bouton d'ajout */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.5,
					px: 1,
					py: 0.5,
					borderBottom: 1,
					borderColor: 'divider',
					flexShrink: 0,
					overflowX: 'auto',
				}}
			>
				{terminals.map((id) => {
					const selected = id === activeId;
					return (
						<Chip
							key={id}
							size="small"
							icon={<TerminalRoundedIcon sx={{ fontSize: '14px !important' }} />}
							label={t('terminalTab', { n: id })}
							onClick={() => setActiveId(id)}
							onDelete={() => closeTerminal(id)}
							deleteIcon={
								<Tooltip title={t('closeTerminal')} arrow>
									<CloseRoundedIcon />
								</Tooltip>
							}
							variant={selected ? 'filled' : 'outlined'}
							sx={{
								height: 24,
								fontSize: '0.7rem',
								cursor: 'pointer',
								...(selected && {
									bgcolor: (theme) => alpha(theme.palette.primary.main, 0.16),
									color: 'primary.main',
									'& .MuiChip-icon': { color: 'primary.main' },
								}),
							}}
						/>
					);
				})}
				<Tooltip title={t('addTerminal')} arrow>
					<IconButton
						size="small"
						onClick={addTerminal}
						sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
					>
						<AddRoundedIcon sx={{ fontSize: 18 }} />
					</IconButton>
				</Tooltip>
			</Box>

			{/* Zone terminaux : tous montés, seul l'actif est visible. */}
			<Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
				{terminals.length === 0 ? (
					<Box
						sx={{
							height: '100%',
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 1,
						}}
					>
						<Typography variant="caption" sx={{ color: 'text.disabled' }}>
							{t('noTerminal')}
						</Typography>
						<Button
							size="small"
							startIcon={<AddRoundedIcon />}
							onClick={addTerminal}
							sx={{ textTransform: 'none' }}
						>
							{t('addTerminal')}
						</Button>
					</Box>
				) : (
					terminals.map((id) => (
						<Box
							key={id}
							sx={{
								position: 'absolute',
								inset: 0,
								display: id === activeId ? 'flex' : 'none',
							}}
						>
							<ShellTerminal
								ref={(h) => {
									if (h) handles.current.set(id, h);
									else handles.current.delete(id);
								}}
								shellSessionId={`${sessionId}-shell-${id}`}
								cwd={cwd}
								active={id === activeId}
								ready={ready}
							/>
						</Box>
					))
				)}
			</Box>
		</Box>
	);
}
