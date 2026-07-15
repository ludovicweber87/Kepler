'use client';

import { useState, useMemo, memo, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useGitDiff } from '@/hooks/useGitDiff';
import { buildSideBySideRows, type FileDiff, type SideBySideRow } from '@/lib/gitDiff';

/* ── Shared line styles ── */
const LINE_HEIGHT = '20px';
const FONT = '"JetBrains Mono", monospace';
const FONT_SIZE = '0.72rem';

function getBgColor(type: 'del' | 'add' | 'ctx' | 'empty') {
	if (type === 'ctx') return 'transparent';
	return (theme: {
		palette: { error: { main: string }; success: { main: string }; text: { primary: string } };
	}) => {
		if (type === 'del') return alpha(theme.palette.error.main, 0.1);
		if (type === 'add') return alpha(theme.palette.success.main, 0.1);
		return alpha(theme.palette.text.primary, 0.015);
	};
}

function getBgHover(type: 'del' | 'add' | 'ctx' | 'empty') {
	return (theme: {
		palette: { error: { main: string }; success: { main: string }; text: { primary: string } };
	}) => {
		if (type === 'del') return alpha(theme.palette.error.main, 0.16);
		if (type === 'add') return alpha(theme.palette.success.main, 0.16);
		return alpha(theme.palette.text.primary, 0.02);
	};
}

const TEXT_COLORS = {
	del: 'error.light',
	add: 'success.light',
	ctx: undefined, // text.secondary
	empty: 'transparent',
} as const;

/* ── Side panel (one side of the diff) ── */
function SidePanel({
	lineNo,
	content,
	type,
}: {
	lineNo?: number;
	content: string;
	type: 'del' | 'add' | 'ctx' | 'empty';
}) {
	return (
		<Box
			sx={{
				flex: 1,
				display: 'flex',
				minWidth: 0,
				bgcolor: getBgColor(type),
				'&:hover': { bgcolor: getBgHover(type) },
			}}
		>
			{/* Line number */}
			<Typography
				variant="caption"
				sx={{
					width: 44,
					flexShrink: 0,
					textAlign: 'right',
					px: 0.75,
					fontFamily: FONT,
					fontSize: '0.65rem',
					color: 'text.disabled',
					lineHeight: LINE_HEIGHT,
					userSelect: 'none',
					borderRight: 1,
					borderColor: 'divider',
				}}
			>
				{lineNo ?? ''}
			</Typography>

			{/* Sign */}
			<Typography
				sx={{
					width: 20,
					flexShrink: 0,
					textAlign: 'center',
					fontFamily: FONT,
					fontSize: FONT_SIZE,
					lineHeight: LINE_HEIGHT,
					fontWeight: 700,
					color:
						type === 'del'
							? 'error.main'
							: type === 'add'
								? 'success.main'
								: 'transparent',
				}}
			>
				{type === 'del' ? '−' : type === 'add' ? '+' : ' '}
			</Typography>

			{/* Code */}
			<Typography
				component="pre"
				sx={{
					flex: 1,
					m: 0,
					fontFamily: FONT,
					fontSize: FONT_SIZE,
					lineHeight: LINE_HEIGHT,
					color: TEXT_COLORS[type] ?? 'text.secondary',
					whiteSpace: 'pre',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					pr: 1,
					minWidth: 0,
				}}
			>
				{content}
			</Typography>
		</Box>
	);
}

/* ── Max rows to render before truncation ── */
const MAX_ROWS_INITIAL = 120;

/* ── Single row (memoized to avoid re-renders) ── */
const DiffRow = memo(function DiffRow({ row }: { row: SideBySideRow }) {
	return (
		<Box sx={{ display: 'flex' }}>
			<SidePanel lineNo={row.left.lineNo} content={row.left.content} type={row.left.type} />
			<Box sx={{ width: '1px', flexShrink: 0, bgcolor: 'divider' }} />
			<SidePanel
				lineNo={row.right.lineNo}
				content={row.right.content}
				type={row.right.type}
			/>
		</Box>
	);
});

/* ── File Diff Viewer (side-by-side, lazy + truncated) ── */
export const FileDiffView = memo(function FileDiffView({
	file,
	focused = false,
	focusNonce = 0,
}: {
	file: FileDiff;
	focused?: boolean;
	focusNonce?: number;
}) {
	const t = useTranslations('agentDiff');
	const [manualExpanded, setManualExpanded] = useState(false);
	const [showAll, setShowAll] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	// Un fichier ciblé est toujours déplié ; sinon l'état est piloté par le clic.
	const expanded = manualExpanded || focused;

	// Ciblage depuis le chat / la liste Activity : on scrolle sur le fichier.
	useEffect(() => {
		if (!focused) return;
		rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}, [focused, focusNonce]);

	const total = file.additions + file.deletions;
	const maxBlocks = 5;
	const addBlocks = total > 0 ? Math.round((file.additions / total) * maxBlocks) : 0;
	const delBlocks = total > 0 ? maxBlocks - addBlocks : 0;

	// Only compute rows when expanded (lazy)
	const allRows = useMemo(() => {
		if (!expanded) return [];
		return file.hunks.flatMap((hunk) => {
			const rows = buildSideBySideRows(hunk.lines);
			return [
				{ type: 'hunk-header' as const, header: hunk.header },
				...rows.map((r) => ({ type: 'row' as const, ...r })),
			];
		});
	}, [expanded, file.hunks]);

	const isTruncated = !showAll && allRows.length > MAX_ROWS_INITIAL;
	const visibleRows = isTruncated ? allRows.slice(0, MAX_ROWS_INITIAL) : allRows;
	const hiddenCount = allRows.length - MAX_ROWS_INITIAL;

	const toggleExpand = useCallback(() => setManualExpanded((p) => !p), []);

	return (
		<Box ref={rootRef} sx={{ scrollMarginTop: 8 }}>
			{/* File header */}
			<Box
				onClick={toggleExpand}
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					py: 1,
					px: 2,
					cursor: 'pointer',
					transition: 'background-color 0.15s',
					'&:hover': {
						bgcolor: (t: { palette: { action: { hover: string } } }) =>
							t.palette.action.hover,
					},
				}}
			>
				<ExpandMoreRoundedIcon
					sx={{
						fontSize: 18,
						color: 'text.disabled',
						transition: 'transform 0.2s',
						transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
					}}
				/>
				<InsertDriveFileRoundedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
				<Typography
					variant="body2"
					sx={{ fontFamily: FONT, fontSize: '0.78rem', flex: 1, color: 'text.primary' }}
				>
					{file.path}
					{file.oldPath && (
						<Typography
							component="span"
							sx={{ color: 'text.disabled', fontSize: '0.7rem', ml: 1 }}
						>
							← {file.oldPath}
						</Typography>
					)}
				</Typography>

				{file.additions > 0 && (
					<Typography
						variant="caption"
						sx={{
							color: 'success.main',
							fontWeight: 700,
							fontFamily: 'monospace',
							fontSize: '0.72rem',
						}}
					>
						+{file.additions}
					</Typography>
				)}
				{file.deletions > 0 && (
					<Typography
						variant="caption"
						sx={{
							color: 'error.main',
							fontWeight: 700,
							fontFamily: 'monospace',
							fontSize: '0.72rem',
						}}
					>
						−{file.deletions}
					</Typography>
				)}

				<Box sx={{ display: 'flex', gap: '2px', ml: 0.5 }}>
					{Array.from({ length: addBlocks }).map((_, i) => (
						<Box
							key={`a${i}`}
							sx={{
								width: 8,
								height: 8,
								borderRadius: '1px',
								bgcolor: 'success.main',
							}}
						/>
					))}
					{Array.from({ length: delBlocks }).map((_, i) => (
						<Box
							key={`d${i}`}
							sx={{ width: 8, height: 8, borderRadius: '1px', bgcolor: 'error.main' }}
						/>
					))}
				</Box>
			</Box>

			{/* Side-by-side diff — unmountOnExit avoids DOM cost when collapsed */}
			<Collapse in={expanded} timeout={200} unmountOnExit>
				<Box
					sx={{
						mx: 2,
						mb: 1.5,
						borderRadius: 1,
						border: 1,
						borderColor: 'divider',
						overflow: 'hidden',
					}}
				>
					{visibleRows.map((item, idx) => {
						if (item.type === 'hunk-header') {
							return (
								<Box
									key={`h${idx}`}
									sx={{
										px: 1.5,
										py: 0.5,
										bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
										borderBottom: 1,
										borderColor: 'divider',
										...(idx > 0 && { borderTop: 1 }),
									}}
								>
									<Typography
										variant="caption"
										sx={{
											fontFamily: FONT,
											fontSize: '0.68rem',
											color: 'text.disabled',
										}}
									>
										{item.header}
									</Typography>
								</Box>
							);
						}
						return <DiffRow key={idx} row={item as SideBySideRow} />;
					})}

					{/* Truncation notice */}
					{isTruncated && (
						<Box
							sx={{
								display: 'flex',
								justifyContent: 'center',
								py: 1,
								borderTop: 1,
								borderColor: 'divider',
								bgcolor: (theme) => alpha(theme.palette.primary.main, 0.03),
							}}
						>
							<Button
								size="small"
								onClick={() => setShowAll(true)}
								sx={{
									textTransform: 'none',
									fontSize: '0.72rem',
									fontWeight: 600,
									color: 'primary.main',
								}}
							>
								{t('showRemainingLines', { count: hiddenCount })}
							</Button>
						</Box>
					)}
				</Box>
			</Collapse>
		</Box>
	);
});

/* ── Main component ── */
interface AgentDiffTabProps {
	projectPath: string | null;
	branch: string | null;
	/** Chemin du fichier à cibler (déplier + scroller). Peut être un chemin absolu. */
	activeFile?: string | null;
	/** Change à chaque demande d'ouverture pour re-déclencher le ciblage même fichier. */
	focusNonce?: number;
}

export default function AgentDiffTab({
	projectPath,
	branch,
	activeFile,
	focusNonce = 0,
}: AgentDiffTabProps) {
	const t = useTranslations('agentDiff');
	const { files, isLoading, error } = useGitDiff(projectPath, branch);

	const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
	const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

	// Résout le fichier ciblé : activeFile peut être absolu, file.path est relatif au repo.
	const focusedPath = useMemo(() => {
		if (!activeFile) return null;
		const norm = activeFile.replace(/\\/g, '/');
		const match = files.find((f) => norm === f.path || norm.endsWith('/' + f.path));
		return match?.path ?? null;
	}, [activeFile, files]);

	if (isLoading) {
		return (
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
				}}
			>
				<CircularProgress size={24} sx={{ color: 'primary.main' }} />
			</Box>
		);
	}

	if (error) {
		return (
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
				}}
			>
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{t('loadError')}
				</Typography>
			</Box>
		);
	}

	if (files.length === 0) {
		return (
			<Box
				sx={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
					gap: 1,
				}}
			>
				<InsertDriveFileRoundedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
				<Typography variant="body2" sx={{ color: 'text.disabled' }}>
					{t('noChanges')}
				</Typography>
			</Box>
		);
	}

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				height: '100%',
				bgcolor: 'background.default',
			}}
		>
			{/* Stats header */}
			<Box
				sx={{
					px: 2,
					py: 1.5,
					borderBottom: 1,
					borderColor: 'divider',
					display: 'flex',
					alignItems: 'center',
					gap: 2,
					flexShrink: 0,
				}}
			>
				<Typography
					variant="caption"
					sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}
				>
					{t('filesChanged', { count: files.length })}
				</Typography>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<AddRoundedIcon sx={{ fontSize: 14, color: 'success.main' }} />
					<Typography
						variant="caption"
						sx={{
							color: 'success.main',
							fontWeight: 700,
							fontFamily: 'monospace',
							fontSize: '0.72rem',
						}}
					>
						{totalAdditions}
					</Typography>
				</Box>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<RemoveRoundedIcon sx={{ fontSize: 14, color: 'error.main' }} />
					<Typography
						variant="caption"
						sx={{
							color: 'error.main',
							fontWeight: 700,
							fontFamily: 'monospace',
							fontSize: '0.72rem',
						}}
					>
						{totalDeletions}
					</Typography>
				</Box>
			</Box>

			{/* File list */}
			<Box
				sx={{
					flex: 1,
					overflowY: 'auto',
					'&::-webkit-scrollbar': { width: 6 },
					'&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 },
				}}
			>
				{files.map((file) => (
					<FileDiffView
						key={file.path}
						file={file}
						focused={file.path === focusedPath}
						focusNonce={focusNonce}
					/>
				))}
			</Box>
		</Box>
	);
}
