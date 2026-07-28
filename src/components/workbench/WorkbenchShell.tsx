'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Tabs from '@mui/material/Tabs';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import PictureInPictureAltRoundedIcon from '@mui/icons-material/PictureInPictureAltRounded';
import { appShadow } from '@/theme/shadows';
import { FILE_TAB_WIDTH } from '@/components/shared/FileTab';
import { useAppSetting } from '@/hooks/useAppSetting';
import { useHotkey } from '@/hooks/useHotkey';
import { clampSplitPct, parseSplitPct, SPLIT_DEFAULT } from '@/lib/workbenchSplit';

const TERM_HEIGHT_DEFAULT = 340;

/** Borne la hauteur du terminal : jamais sous 120px, jamais au point d'écraser le panneau. */
function clampTermHeight(px: number): number {
	if (!Number.isFinite(px)) return TERM_HEIGHT_DEFAULT;
	return Math.max(120, Math.min(window.innerHeight - 200, px));
}

interface WorkbenchShellProps {
	/** Left side of the header: title + branch/status chips. */
	headerLeft: ReactNode;
	/** Action buttons rendered before the repo chip (Create PR, Continue…). */
	headerActions?: ReactNode;
	/** Repo label chip (omitted when empty). */
	repoLabel?: string;
	/** Renders the stop icon when true; calls onStop on click. */
	stoppable?: boolean;
	onStop?: () => void;
	stopTitle?: string;
	/** Renders the picture-in-picture icon when provided. */
	onPip?: () => void;

	leftTabValue: string;
	onLeftTabChange: (value: string) => void;
	/**
	 * `<Tab />` nodes for the left column. Must be an ARRAY, not a Fragment:
	 * MUI `<Tabs>` clones its direct children to wire `onChange`/`value` and
	 * does not descend into a Fragment (clicks would become no-ops).
	 */
	leftTabs: ReactNode[];
	/** Content below the left tabs (caller toggles per active tab). */
	leftContent: ReactNode;

	rightTabValue: string;
	onRightTabChange: (value: string) => void;
	/** `<Tab />` nodes for the right column. Must be an ARRAY (see `leftTabs`). */
	rightTabs: ReactNode[];
	/** Content below the right tabs (caller toggles per active tab). */
	rightContent: ReactNode;

	/**
	 * Terminal area, stacked below the right panel with a vertical resize handle.
	 * Reçoit `visible` (faux quand le panneau est replié par ⌘J) : le terminal reste
	 * monté — le démonter tuerait le scrollback xterm et le WebSocket PTY — et se
	 * contente de se refit quand il redevient visible.
	 */
	terminal: (visible: boolean) => ReactNode;
}

/**
 * Shared Workbench chrome: header, left tab column, right panel (tabs + content),
 * and a resizable terminal stacked below. Presentational only — every mode
 * (single session, pipeline run) composes it with its own data wiring.
 */
export default function WorkbenchShell({
	headerLeft,
	headerActions,
	repoLabel,
	stoppable = false,
	onStop,
	stopTitle,
	onPip,
	leftTabValue,
	onLeftTabChange,
	leftTabs,
	leftContent,
	rightTabValue,
	onRightTabChange,
	rightTabs,
	rightContent,
	terminal,
}: WorkbenchShellProps) {
	const t = useTranslations('workbench');

	// Vertical resize of the terminal area (px from the bottom). Persisté en DB,
	// même pattern que `workbench_split_pct` plus bas.
	const {
		valueOrDefault: termHeightRaw,
		isLoading: termHeightLoading,
		save: saveTermHeight,
	} = useAppSetting('workbench_terminal_height', String(TERM_HEIGHT_DEFAULT));
	const [termHeight, setTermHeight] = useState(TERM_HEIGHT_DEFAULT);
	const termHeightRef = useRef(TERM_HEIGHT_DEFAULT);
	const termHydrated = useRef(false);
	const resizing = useRef(false);

	// Replié par ⌘J. Non persisté : au chargement le terminal est toujours ouvert.
	const [termCollapsed, setTermCollapsed] = useState(false);
	useHotkey('j', () => setTermCollapsed((prev) => !prev));

	useEffect(() => {
		if (termHeightLoading || termHydrated.current || resizing.current) return;
		const next = clampTermHeight(Number(termHeightRaw));
		termHeightRef.current = next;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- hydratation unique depuis la DB (React Query), pas une boucle de sync
		setTermHeight(next);
		termHydrated.current = true;
	}, [termHeightLoading, termHeightRaw]);

	const startResize = useCallback(
		(e: React.MouseEvent) => {
			resizing.current = true;
			e.preventDefault();
			// Tirer la poignée d'un panneau replié le déplie.
			setTermCollapsed(false);
			const onMove = (ev: MouseEvent) => {
				if (!resizing.current) return;
				const next = clampTermHeight(window.innerHeight - ev.clientY);
				termHeightRef.current = next;
				setTermHeight(next);
			};
			const onUp = () => {
				resizing.current = false;
				document.removeEventListener('mousemove', onMove);
				document.removeEventListener('mouseup', onUp);
				document.body.style.userSelect = '';
				// Best-effort : ne pas propager d'unhandled rejection si l'API est offline.
				void saveTermHeight(String(Math.round(termHeightRef.current))).catch(() => {});
			};
			document.body.style.userSelect = 'none';
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		},
		[saveTermHeight],
	);

	// Resize horizontal du split gauche/droite (pourcentage de largeur gauche).
	const {
		valueOrDefault: splitRaw,
		isLoading: splitLoading,
		save: saveSplit,
	} = useAppSetting('workbench_split_pct', String(SPLIT_DEFAULT));
	const splitRef = useRef<HTMLDivElement>(null);
	const [leftPct, setLeftPct] = useState(SPLIT_DEFAULT);
	const leftPctRef = useRef(SPLIT_DEFAULT);
	const hydrated = useRef(false);
	const hResizing = useRef(false);

	// Hydrate depuis la DB une fois la query résolue (React Query renvoie le
	// défaut tant qu'elle charge : attendre !isLoading évite de figer le défaut).
	useEffect(() => {
		if (splitLoading || hydrated.current || hResizing.current) return;
		const next = parseSplitPct(splitRaw);
		leftPctRef.current = next;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- hydratation unique depuis la DB (React Query), pas une boucle de sync
		setLeftPct(next);
		hydrated.current = true;
	}, [splitLoading, splitRaw]);

	const startHResize = useCallback(
		(e: React.MouseEvent) => {
			hResizing.current = true;
			e.preventDefault();
			const onMove = (ev: MouseEvent) => {
				if (!hResizing.current || !splitRef.current) return;
				const rect = splitRef.current.getBoundingClientRect();
				const pct = clampSplitPct(((ev.clientX - rect.left) / rect.width) * 100);
				leftPctRef.current = pct;
				setLeftPct(pct);
			};
			const onUp = () => {
				hResizing.current = false;
				document.removeEventListener('mousemove', onMove);
				document.removeEventListener('mouseup', onUp);
				document.body.style.userSelect = '';
				// Persistance best-effort : ne pas propager d'unhandled rejection si l'API est offline.
				void saveSplit(String(Math.round(leftPctRef.current))).catch(() => {});
			};
			document.body.style.userSelect = 'none';
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		},
		[saveSplit],
	);

	return (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
			{/* Header session */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					px: 2,
					py: 1,
					borderBottom: 1,
					borderColor: 'divider',
					flexShrink: 0,
				}}
			>
				{headerLeft}
				<Box sx={{ flex: 1 }} />
				{headerActions && (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						{headerActions}
					</Box>
				)}
				{repoLabel && (
					<Chip
						icon={<FolderOpenRoundedIcon sx={{ fontSize: '14px !important' }} />}
						label={repoLabel}
						size="small"
						sx={{
							height: 24,
							fontSize: '0.7rem',
							bgcolor: (theme) => alpha(theme.palette.text.primary, 0.05),
						}}
					/>
				)}
				{stoppable && (
					<Tooltip title={stopTitle ?? ''} arrow>
						<IconButton
							size="small"
							onClick={() => onStop?.()}
							sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
						>
							<StopCircleRoundedIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</Tooltip>
				)}
				{onPip && (
					<IconButton
						size="small"
						onClick={onPip}
						sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
					>
						<PictureInPictureAltRoundedIcon sx={{ fontSize: 18 }} />
					</IconButton>
				)}
			</Box>

			{/* Split gauche/droite */}
			<Box ref={splitRef} sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
				{/* Gauche : conversation + fichiers (~68%) */}
				<Box
					sx={{
						flex: `0 0 ${leftPct}%`,
						minWidth: 0,
						minHeight: 0,
						display: 'flex',
						flexDirection: 'column',
					}}
				>
					<Tabs
						value={leftTabValue}
						onChange={(_, val) => onLeftTabChange(val as string)}
						variant="scrollable"
						scrollButtons="auto"
						sx={{
							minHeight: 40,
							borderBottom: 1,
							borderColor: 'divider',
							flexShrink: 0,
							'& .MuiTab-root': {
								textTransform: 'none',
								minHeight: 40,
								width: FILE_TAB_WIDTH,
								minWidth: FILE_TAB_WIDTH,
								maxWidth: FILE_TAB_WIDTH,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							},
						}}
					>
						{leftTabs}
					</Tabs>
					{leftContent}
				</Box>

				{/* Poignée verticale — resize horizontal du split */}
				<Box
					onMouseDown={startHResize}
					sx={{
						width: 6,
						flexShrink: 0,
						cursor: 'col-resize',
						bgcolor: 'divider',
						'&:hover': { bgcolor: 'primary.main' },
					}}
				/>

				{/* Droite : panneau + terminal */}
				<Box
					sx={{
						flex: 1,
						minWidth: 0,
						borderLeft: 1,
						borderColor: 'divider',
						boxShadow: (th) => appShadow(th.palette.mode),
						display: 'flex',
						flexDirection: 'column',
						minHeight: 0,
					}}
				>
					<Tabs
						value={rightTabValue}
						onChange={(_, val) => onRightTabChange(val as string)}
						variant="scrollable"
						scrollButtons="auto"
						sx={{
							minHeight: 40,
							borderBottom: 1,
							borderColor: 'divider',
							flexShrink: 0,
							'& .MuiTab-root': { textTransform: 'none', minHeight: 40 },
						}}
					>
						{rightTabs}
					</Tabs>

					<Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{rightContent}</Box>

					{/* Handle de resize — porte aussi l'indice ⌘J, seule affordance du repli. */}
					<Tooltip title={t('toggleTerminal')} enterDelay={700} disableInteractive>
						<Box
							onMouseDown={startResize}
							sx={{
								height: 6,
								flexShrink: 0,
								cursor: 'row-resize',
								bgcolor: 'divider',
								'&:hover': { bgcolor: 'primary.main' },
							}}
						/>
					</Tooltip>

					{/* Terminaux empilés */}
					<Box
						sx={{
							height: termCollapsed ? 0 : termHeight,
							flexShrink: 0,
							display: 'flex',
							flexDirection: 'column',
							minHeight: 0,
							overflow: 'hidden',
						}}
					>
						{terminal(!termCollapsed)}
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
