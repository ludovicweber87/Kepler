'use client';

import { useState, useMemo, memo, useCallback } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';

/* ── Types ── */
interface FileDiff {
	path: string;
	oldPath?: string;
	additions: number;
	deletions: number;
	hunks: Hunk[];
}

interface Hunk {
	header: string;
	lines: DiffLine[];
}

interface DiffLine {
	type: 'add' | 'del' | 'ctx';
	content: string;
	oldLineNo?: number;
	newLineNo?: number;
}

/** A paired row for side-by-side display */
interface SideBySideRow {
	left: { lineNo?: number; content: string; type: 'del' | 'ctx' | 'empty' };
	right: { lineNo?: number; content: string; type: 'add' | 'ctx' | 'empty' };
}

/* ── Parser ── */
function parseDiff(raw: string): FileDiff[] {
	if (!raw.trim()) return [];

	const files: FileDiff[] = [];
	const fileParts = raw.split(/^diff --git /m).filter(Boolean);

	for (const part of fileParts) {
		const lines = part.split('\n');
		const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
		if (!headerMatch) continue;

		const oldPath = headerMatch[1];
		const newPath = headerMatch[2];

		const file: FileDiff = {
			path: newPath,
			oldPath: oldPath !== newPath ? oldPath : undefined,
			additions: 0,
			deletions: 0,
			hunks: [],
		};

		let currentHunk: Hunk | null = null;
		let oldLine = 0;
		let newLine = 0;

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i];
			const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
			if (hunkMatch) {
				oldLine = parseInt(hunkMatch[1], 10);
				newLine = parseInt(hunkMatch[2], 10);
				currentHunk = { header: line, lines: [] };
				file.hunks.push(currentHunk);
				continue;
			}
			if (!currentHunk) continue;
			if (line.startsWith('\\')) continue;

			if (line.startsWith('+')) {
				currentHunk.lines.push({ type: 'add', content: line.slice(1), newLineNo: newLine++ });
				file.additions++;
			} else if (line.startsWith('-')) {
				currentHunk.lines.push({ type: 'del', content: line.slice(1), oldLineNo: oldLine++ });
				file.deletions++;
			} else if (line.length > 0 || (currentHunk.lines.length > 0 && line === '')) {
				currentHunk.lines.push({
					type: 'ctx',
					content: line.startsWith(' ') ? line.slice(1) : line,
					oldLineNo: oldLine++,
					newLineNo: newLine++,
				});
			}
		}
		files.push(file);
	}
	return files;
}

/* ── Build side-by-side rows from hunk lines ── */
function buildSideBySideRows(lines: DiffLine[]): SideBySideRow[] {
	const rows: SideBySideRow[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (line.type === 'ctx') {
			rows.push({
				left: { lineNo: line.oldLineNo, content: line.content, type: 'ctx' },
				right: { lineNo: line.newLineNo, content: line.content, type: 'ctx' },
			});
			i++;
		} else if (line.type === 'del') {
			// Collect consecutive del lines, then pair with following add lines
			const dels: DiffLine[] = [];
			while (i < lines.length && lines[i].type === 'del') {
				dels.push(lines[i]);
				i++;
			}
			const adds: DiffLine[] = [];
			while (i < lines.length && lines[i].type === 'add') {
				adds.push(lines[i]);
				i++;
			}

			const maxLen = Math.max(dels.length, adds.length);
			for (let j = 0; j < maxLen; j++) {
				const del = dels[j];
				const add = adds[j];
				rows.push({
					left: del
						? { lineNo: del.oldLineNo, content: del.content, type: 'del' }
						: { content: '', type: 'empty' },
					right: add
						? { lineNo: add.newLineNo, content: add.content, type: 'add' }
						: { content: '', type: 'empty' },
				});
			}
		} else if (line.type === 'add') {
			// Standalone add (no preceding del)
			rows.push({
				left: { content: '', type: 'empty' },
				right: { lineNo: line.newLineNo, content: line.content, type: 'add' },
			});
			i++;
		}
	}

	return rows;
}

/* ── Shared line styles ── */
const LINE_HEIGHT = '20px';
const FONT = '"JetBrains Mono", monospace';
const FONT_SIZE = '0.72rem';

function getBgColor(type: 'del' | 'add' | 'ctx' | 'empty') {
	if (type === 'ctx') return 'transparent';
	return (theme: { palette: { error: { main: string }; success: { main: string }; text: { primary: string } } }) => {
		if (type === 'del') return alpha(theme.palette.error.main, 0.1);
		if (type === 'add') return alpha(theme.palette.success.main, 0.1);
		return alpha(theme.palette.text.primary, 0.015);
	};
}

function getBgHover(type: 'del' | 'add' | 'ctx' | 'empty') {
	return (theme: { palette: { error: { main: string }; success: { main: string }; text: { primary: string } } }) => {
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
						type === 'del' ? 'error.main' : type === 'add' ? 'success.main' : 'transparent',
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
			<SidePanel lineNo={row.right.lineNo} content={row.right.content} type={row.right.type} />
		</Box>
	);
});

/* ── File Diff Viewer (side-by-side, lazy + truncated) ── */
const FileDiffView = memo(function FileDiffView({ file }: { file: FileDiff }) {
	const t = useTranslations('agentDiff');
	const [expanded, setExpanded] = useState(false);
	const [showAll, setShowAll] = useState(false);

	const total = file.additions + file.deletions;
	const maxBlocks = 5;
	const addBlocks = total > 0 ? Math.round((file.additions / total) * maxBlocks) : 0;
	const delBlocks = total > 0 ? maxBlocks - addBlocks : 0;

	// Only compute rows when expanded (lazy)
	const allRows = useMemo(() => {
		if (!expanded) return [];
		return file.hunks.flatMap((hunk) => {
			const rows = buildSideBySideRows(hunk.lines);
			return [{ type: 'hunk-header' as const, header: hunk.header }, ...rows.map((r) => ({ type: 'row' as const, ...r }))];
		});
	}, [expanded, file.hunks]);

	const isTruncated = !showAll && allRows.length > MAX_ROWS_INITIAL;
	const visibleRows = isTruncated ? allRows.slice(0, MAX_ROWS_INITIAL) : allRows;
	const hiddenCount = allRows.length - MAX_ROWS_INITIAL;

	const toggleExpand = useCallback(() => setExpanded((p) => !p), []);

	return (
		<Box>
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
						sx={{ color: 'success.main', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.72rem' }}
					>
						+{file.additions}
					</Typography>
				)}
				{file.deletions > 0 && (
					<Typography
						variant="caption"
						sx={{ color: 'error.main', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.72rem' }}
					>
						−{file.deletions}
					</Typography>
				)}

				<Box sx={{ display: 'flex', gap: '2px', ml: 0.5 }}>
					{Array.from({ length: addBlocks }).map((_, i) => (
						<Box key={`a${i}`} sx={{ width: 8, height: 8, borderRadius: '1px', bgcolor: 'success.main' }} />
					))}
					{Array.from({ length: delBlocks }).map((_, i) => (
						<Box key={`d${i}`} sx={{ width: 8, height: 8, borderRadius: '1px', bgcolor: 'error.main' }} />
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
										sx={{ fontFamily: FONT, fontSize: '0.68rem', color: 'text.disabled' }}
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
}

export default function AgentDiffTab({ projectPath, branch }: AgentDiffTabProps) {
	const t = useTranslations('agentDiff');
	const { data, isLoading, error } = useQuery({
		queryKey: ['git-diff', projectPath, branch],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (projectPath) params.set('cwd', projectPath);
			if (branch) params.set('branch', branch);
			const res = await localFetch(`/git/diff?${params}`);
			if (!res.ok) throw new Error('Failed to fetch diff');
			return res.json() as Promise<{ diff: string; stats: string }>;
		},
		enabled: !!projectPath,
		staleTime: 30_000,
	});

	const files = useMemo(() => parseDiff(data?.diff ?? ''), [data?.diff]);
	const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
	const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

	if (isLoading) {
		return (
			<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
				<CircularProgress size={24} sx={{ color: 'primary.main' }} />
			</Box>
		);
	}

	if (error) {
		return (
			<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
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
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default' }}>
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
						sx={{ color: 'success.main', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.72rem' }}
					>
						{totalAdditions}
					</Typography>
				</Box>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
					<RemoveRoundedIcon sx={{ fontSize: 14, color: 'error.main' }} />
					<Typography
						variant="caption"
						sx={{ color: 'error.main', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.72rem' }}
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
					<FileDiffView key={file.path} file={file} />
				))}
			</Box>
		</Box>
	);
}
