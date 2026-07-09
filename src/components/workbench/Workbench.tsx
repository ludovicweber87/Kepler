'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import { useTranslations } from 'next-intl';
import { useAgentSessionHistory, useAgentSession } from '@/hooks/useAgentSession';
import { useSessionActions } from '@/hooks/useSessionActions';
import { classifySession } from '@/lib/sessionStatus';
import { resolveEffectivePath } from '@/lib/effectivePath';
import AgentChatTab from '@/components/agents/AgentChatTab';

export default function Workbench() {
	const t = useTranslations('workbench');
	const searchParams = useSearchParams();
	const sessionId = searchParams.get('session') ?? undefined;

	const { data: allSessions = [] } = useAgentSessionHistory();
	const { session } = useAgentSession(sessionId);
	const { resume } = useSessionActions();

	// Fallback : la session peut deja etre dans l'historique avant que useAgentSession resolve.
	const resolved = useMemo(
		() => session ?? allSessions.find((s) => s.session_id === sessionId) ?? null,
		[session, allSessions, sessionId],
	);

	const bucket = resolved ? classifySession(resolved) : null;
	const isArchived = bucket === 'archived';
	const chatReadOnly = !!sessionId && bucket !== null && bucket !== 'active';

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
			<Box sx={{ flex: 1, minWidth: 0, borderLeft: 1, borderColor: 'divider' }} />
		</Box>
	);
}
