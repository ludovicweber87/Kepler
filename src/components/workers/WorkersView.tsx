'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import { alpha, useTheme } from '@mui/material/styles';
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import QuestionAnswerRoundedIcon from '@mui/icons-material/QuestionAnswerRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DraggableTabs from '@/components/shared/DraggableTabs';
import SessionCard from '@/components/shared/SessionCard';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useAllWorktrees } from '@/hooks/useAllWorktrees';
import { useSessionManager } from '@/hooks/useSessionManager';
import { usePendingQuestions } from '@/hooks/usePendingQuestions';
import type { WorktreeInfo } from '@/types';
import type { ActiveSession } from '@/hooks/useActiveSessions';

type WorkerItem =
	| { kind: 'worktree'; wt: WorktreeInfo; projectPath: string; key: string }
	| { kind: 'direct'; session: ActiveSession; projectPath: string; key: string };

export default function WorkersView() {
	const theme = useTheme();
	const t = useTranslations('workers');
	const { views, reorderViews } = useAgentViews();
	const { activeSessions, killSession, getActiveForPath, getPastForPath, fetchSessionForPath } =
		useSessionManager();
	const pendingQuestions = usePendingQuestions();
	const { byPath, deleteWorktree } = useAllWorktrees(views.map((v) => v.path));

	// tab 0 = "All", tab n = views[n-1]
	const [tab, setTab] = useState(0);
	const scopeViews = tab === 0 ? views : [views[tab - 1]].filter(Boolean);

	const [selected, setSelected] = useState<{
		worktree: WorktreeInfo;
		projectPath: string;
		existingSessionId?: string;
		isPastSession?: boolean;
	} | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<{
		wt: WorktreeInfo;
		projectPath: string;
	} | null>(null);
	const [deleteAnchorEl, setDeleteAnchorEl] = useState<HTMLElement | null>(null);

	const items = useMemo(() => {
		const out: WorkerItem[] = [];
		for (const view of scopeViews) {
			const worktrees = byPath.get(view.path) ?? [];
			const worktreePaths = new Set(worktrees.map((wt) => wt.path));
			for (const wt of worktrees) {
				out.push({ kind: 'worktree', wt, projectPath: view.path, key: `wt-${wt.path}` });
			}
			for (const s of activeSessions) {
				if (s.cwd.startsWith(view.path) && !worktreePaths.has(s.cwd)) {
					out.push({
						kind: 'direct',
						session: s,
						projectPath: view.path,
						key: `direct-${s.sessionId}`,
					});
				}
			}
		}
		return out;
	}, [scopeViews, byPath, activeSessions]);

	const isItemActive = useCallback(
		(item: WorkerItem) => item.kind === 'direct' || !!getActiveForPath(item.wt.path),
		[getActiveForPath],
	);

	const activeItems = items.filter(isItemActive);
	const inactiveItems = items.filter((i) => !isItemActive(i));

	const kpi = useMemo(() => {
		let questions = 0;
		let completed = 0;
		for (const item of items) {
			const path = item.kind === 'direct' ? item.session.cwd : item.wt.path;
			if (pendingQuestions.has(path)) questions++;
			if (item.kind === 'worktree' && !getActiveForPath(item.wt.path)) {
				const past = getPastForPath(item.wt.path, item.wt.branch);
				if (past) completed++;
			}
		}
		return { active: activeItems.length, questions, completed };
	}, [items, activeItems.length, pendingQuestions, getActiveForPath, getPastForPath]);

	const handleWorktreeClick = useCallback(
		async (wt: WorktreeInfo, projectPath: string) => {
			const active = getActiveForPath(wt.path);
			if (active) {
				setSelected({ worktree: wt, projectPath, existingSessionId: active.sessionId });
				return;
			}
			const dbSession = await fetchSessionForPath(wt.path);
			if (dbSession) {
				const isDone = dbSession.status === 'completed' || dbSession.status === 'error';
				setSelected({
					worktree: wt,
					projectPath,
					existingSessionId: dbSession.session_id,
					isPastSession: isDone,
				});
				return;
			}
			setSelected({ worktree: wt, projectPath });
		},
		[getActiveForPath, fetchSessionForPath],
	);

	const renderCard = (item: WorkerItem) => {
		if (item.kind === 'direct') {
			const s = item.session;
			return (
				<SessionCard
					key={item.key}
					name={s.branch ?? s.projectName}
					subtitle={s.cwd.split('/').slice(-2).join('/')}
					status="active"
					isStreaming={s.isStreaming}
					hasPendingQuestion={pendingQuestions.has(s.cwd)}
					isWorktree={false}
					onClick={() =>
						setSelected({
							worktree: { path: s.cwd, branch: s.branch ?? 'main', head: '' },
							projectPath: item.projectPath,
							existingSessionId: s.sessionId,
						})
					}
					onStop={() => killSession(s.sessionId)}
				/>
			);
		}
		const wt = item.wt;
		const active = getActiveForPath(wt.path);
		const past = !active ? getPastForPath(wt.path, wt.branch) : null;
		const isError = past?.status === 'error';
		return (
			<SessionCard
				key={item.key}
				name={wt.branch}
				subtitle={wt.path.split('/').slice(-2).join('/')}
				status={active ? 'active' : past ? (isError ? 'error' : 'completed') : 'idle'}
				isStreaming={active?.isStreaming}
				hasPendingQuestion={pendingQuestions.has(wt.path)}
				isWorktree
				onClick={() => handleWorktreeClick(wt, item.projectPath)}
				onStop={active ? () => killSession(active.sessionId) : undefined}
				onDelete={
					!active
						? (e) => {
								setDeleteTarget({ wt, projectPath: item.projectPath });
								setDeleteAnchorEl(e.currentTarget as HTMLElement);
							}
						: undefined
				}
			/>
		);
	};

	const gridSx = {
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
		gap: 1.5,
	} as const;

	return (
		<Box sx={{ maxWidth: 1200, mx: 'auto' }}>
			{/* Header */}
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
				<EngineeringRoundedIcon sx={{ color: 'primary.main' }} />
				<Typography
					variant="h4"
					sx={{
						fontWeight: 700,
						background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					{t('title')}
				</Typography>
			</Box>

			{/* KPI strip */}
			<Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
				<KpiPill
					icon={<BoltRoundedIcon sx={{ fontSize: 16 }} />}
					value={kpi.active}
					label={t('kpiActive')}
					color={theme.palette.success.main}
				/>
				<KpiPill
					icon={<QuestionAnswerRoundedIcon sx={{ fontSize: 16 }} />}
					value={kpi.questions}
					label={t('kpiQuestions')}
					color={theme.palette.warning.main}
				/>
				<KpiPill
					icon={<CheckCircleRoundedIcon sx={{ fontSize: 16 }} />}
					value={kpi.completed}
					label={t('kpiCompleted')}
					color={theme.palette.text.secondary}
				/>
			</Box>

			{/* Project tabs (All + one per view) */}
			{views.length > 0 && (
				<Box sx={{ mb: 3 }}>
					<DraggableTabs
						tabs={[t('allProjects'), ...views.map((v) => v.label)]}
						activeTab={tab}
						onTabChange={setTab}
						onReorder={(order) =>
							reorderViews(order.filter((n) => n !== t('allProjects')))
						}
						counts={[
							activeSessions.length,
							...views.map(
								(v) =>
									activeSessions.filter((s) => s.cwd.startsWith(v.path)).length,
							),
						]}
					/>
				</Box>
			)}

			{items.length === 0 ? (
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						py: 10,
						gap: 1.5,
					}}
				>
					<EngineeringRoundedIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
					<Typography variant="body1" color="text.secondary">
						{t('none')}
					</Typography>
				</Box>
			) : (
				<>
					{activeItems.length > 0 && (
						<Box sx={{ mb: 4 }}>
							<SectionLabel text={t('inProgress')} count={activeItems.length} />
							<Box sx={gridSx}>{activeItems.map(renderCard)}</Box>
						</Box>
					)}
					{inactiveItems.length > 0 && (
						<Box>
							<SectionLabel text={t('inactive')} count={inactiveItems.length} />
							<Box sx={gridSx}>{inactiveItems.map(renderCard)}</Box>
						</Box>
					)}
				</>
			)}

			{/* Delete popover */}
			<Popover
				open={!!deleteTarget && !!deleteAnchorEl}
				anchorEl={deleteAnchorEl}
				onClose={() => {
					setDeleteTarget(null);
					setDeleteAnchorEl(null);
				}}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				slotProps={{
					paper: {
						sx: {
							borderRadius: 2,
							p: 1.5,
							minWidth: 260,
							display: 'flex',
							flexDirection: 'column',
							gap: 0.5,
						},
					},
				}}
			>
				<Typography variant="caption" color="text.secondary" sx={{ px: 1, pb: 0.5 }}>
					{t('deleteTitle', { branch: deleteTarget?.wt.branch ?? '' })}
				</Typography>
				{(['worktreeOnly', 'worktreeAndBranch'] as const).map((mode) => (
					<Button
						key={mode}
						fullWidth
						size="small"
						onClick={() => {
							if (deleteTarget) {
								deleteWorktree(
									deleteTarget.projectPath,
									deleteTarget.wt.path,
									mode === 'worktreeAndBranch',
								);
							}
							setDeleteTarget(null);
							setDeleteAnchorEl(null);
						}}
						sx={{
							justifyContent: 'flex-start',
							textTransform: 'none',
							fontWeight: 600,
							color: theme.palette.error.main,
							'&:hover': { bgcolor: alpha(theme.palette.error.main, 0.08) },
						}}
					>
						{mode === 'worktreeOnly'
							? t('deleteWorktreeOnly')
							: t('deleteWorktreeAndBranch')}
					</Button>
				))}
			</Popover>

			<AgentTerminalModal
				open={!!selected}
				onClose={() => setSelected(null)}
				projectPath={selected?.projectPath}
				existingSessionId={selected?.existingSessionId}
				isPastSession={selected?.isPastSession}
				existingWorktree={
					selected && !selected.existingSessionId
						? { branch: selected.worktree.branch, worktreePath: selected.worktree.path }
						: undefined
				}
			/>
		</Box>
	);
}

function KpiPill({
	icon,
	value,
	label,
	color,
}: {
	icon: React.ReactNode;
	value: number;
	label: string;
	color: string;
}) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1,
				px: 2,
				py: 1,
				borderRadius: 2,
				border: 1,
				borderColor: alpha(color, 0.2),
				bgcolor: alpha(color, 0.06),
			}}
		>
			<Box sx={{ color, display: 'flex' }}>{icon}</Box>
			<Typography variant="h6" sx={{ fontWeight: 700, color, lineHeight: 1 }}>
				{value}
			</Typography>
			<Typography variant="caption" sx={{ color: 'text.secondary' }}>
				{label}
			</Typography>
		</Box>
	);
}

function SectionLabel({ text, count }: { text: string; count: number }) {
	return (
		<Typography
			variant="caption"
			sx={{
				display: 'block',
				mb: 1.25,
				color: 'text.disabled',
				fontWeight: 700,
				textTransform: 'uppercase',
				letterSpacing: 1,
			}}
		>
			{text} — {count}
		</Typography>
	);
}
