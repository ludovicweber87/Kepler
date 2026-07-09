'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import { useTranslations } from 'next-intl';
import { useAgentSessionHistory, useAgentSession } from '@/hooks/useAgentSession';
import { useSessionActions } from '@/hooks/useSessionActions';
import { classifySession } from '@/lib/sessionStatus';
import { resolveEffectivePath } from '@/lib/effectivePath';
import AgentChatTab from '@/components/agents/AgentChatTab';
import AgentDiffTab from '@/components/agents/AgentDiffTab';
import AgentActivityTab from '@/components/agents/AgentActivityTab';
import AgentIssueTab from '@/components/agents/AgentIssueTab';
import ShellTerminal from '@/components/agents/ShellTerminal';

export default function Workbench() {
	const t = useTranslations('workbench');
	const searchParams = useSearchParams();
	const sessionId = searchParams.get('session') ?? undefined;

	const { data: allSessions = [] } = useAgentSessionHistory();
	const { session, logs } = useAgentSession(sessionId);
	const { resume } = useSessionActions();

	// Fallback : la session peut deja etre dans l'historique avant que useAgentSession resolve.
	const resolved = useMemo(
		() => session ?? allSessions.find((s) => s.session_id === sessionId) ?? null,
		[session, allSessions, sessionId],
	);

	const bucket = resolved ? classifySession(resolved) : null;
	const isArchived = bucket === 'archived';
	const chatReadOnly = !!sessionId && bucket !== null && bucket !== 'active';

	const hasIssue = !!resolved?.issue_number;
	type TopPanel = 'files' | 'activity' | 'issue';
	const [topPanel, setTopPanel] = useState<TopPanel>('files');

	// Resize vertical de la zone terminal (px depuis le bas).
	const [termHeight, setTermHeight] = useState(240);
	const resizing = useRef(false);
	const startResize = useCallback((e: React.MouseEvent) => {
		resizing.current = true;
		e.preventDefault();
		const onMove = (ev: MouseEvent) => {
			if (!resizing.current) return;
			const fromBottom = window.innerHeight - ev.clientY;
			setTermHeight(Math.max(120, Math.min(window.innerHeight - 200, fromBottom)));
		};
		const onUp = () => {
			resizing.current = false;
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			document.body.style.userSelect = '';
		};
		document.body.style.userSelect = 'none';
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, []);

	const effectivePath = useMemo(
		() =>
			resolveEffectivePath({
				session: resolved,
				projectPath: resolved?.project_path ?? null,
				worktreePath: resolved?.worktree_path ?? null,
			}),
		[resolved],
	);

	if (!sessionId) {
		return (
			<Box
				sx={{
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 2,
					px: 4,
					textAlign: 'center',
				}}
			>
				<TerminalRoundedIcon sx={{ fontSize: 56, color: 'primary.main', opacity: 0.5 }} />
				<Typography variant="h6" sx={{ fontWeight: 600 }}>
					{t('emptyTitle')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>
					{t('emptyDesc')}
				</Typography>
			</Box>
		);
	}

	return (
		<Box sx={{ height: '100%', display: 'flex', minHeight: 0 }}>
			{/* Gauche : conversation 75% */}
			<Box sx={{ flex: '0 0 75%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
				<AgentChatTab
					sessionId={sessionId}
					cwd={effectivePath}
					readOnly={chatReadOnly}
					archived={isArchived}
					onResume={() => {
						resume(sessionId).catch(() => {});
					}}
				/>
			</Box>
			{/* Droite : sidebar (Task 4) */}
			<Box
				sx={{
					flex: 1,
					minWidth: 0,
					borderLeft: 1,
					borderColor: 'divider',
					display: 'flex',
					flexDirection: 'column',
					minHeight: 0,
				}}
			>
				{/* Chips */}
				<Box sx={{ display: 'flex', gap: 0.75, p: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
					<Chip
						icon={<DescriptionRoundedIcon sx={{ fontSize: '16px !important' }} />}
						label={t('chipFiles')}
						size="small"
						color={topPanel === 'files' ? 'primary' : 'default'}
						variant={topPanel === 'files' ? 'filled' : 'outlined'}
						onClick={() => setTopPanel('files')}
					/>
					<Chip
						icon={<TimelineRoundedIcon sx={{ fontSize: '16px !important' }} />}
						label={t('chipActivity')}
						size="small"
						color={topPanel === 'activity' ? 'primary' : 'default'}
						variant={topPanel === 'activity' ? 'filled' : 'outlined'}
						onClick={() => setTopPanel('activity')}
					/>
					{hasIssue && (
						<Chip
							icon={<BugReportRoundedIcon sx={{ fontSize: '16px !important' }} />}
							label={t('chipIssue')}
							size="small"
							color={topPanel === 'issue' ? 'primary' : 'default'}
							variant={topPanel === 'issue' ? 'filled' : 'outlined'}
							onClick={() => setTopPanel('issue')}
						/>
					)}
				</Box>

				{/* Panneau haut */}
				<Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
					{topPanel === 'files' && (
						<AgentDiffTab
							projectPath={resolved?.worktree_path ?? resolved?.project_path ?? null}
							branch={resolved?.branch ?? null}
						/>
					)}
					{topPanel === 'activity' && <AgentActivityTab session={resolved} logs={logs} />}
					{topPanel === 'issue' && hasIssue && (
						<AgentIssueTab
							owner={resolved!.issue_owner!}
							repo={resolved!.issue_repo!}
							issueNumber={resolved!.issue_number!}
						/>
					)}
				</Box>

				{/* Handle de resize */}
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

				{/* Terminal empilé */}
				<Box sx={{ height: termHeight, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
					<Box sx={{ px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
						<Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
							{t('terminal')}
						</Typography>
					</Box>
					<ShellTerminal sessionId={sessionId} cwd={effectivePath} active ready={!!resolved} />
				</Box>
			</Box>
		</Box>
	);
}
