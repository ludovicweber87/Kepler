'use client';

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/hooks/useNotifications';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';

const LOG_TYPE_COLORS: Record<AgentActivityLog['log_type'], string> = {
	info: '#636B78',
	commit: '#69F0AE',
	file_change: '#FFD740',
	error: '#FF5252',
	summary: '#7C5CFF',
};

function formatTime(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

interface AgentActivityTabProps {
	session: AgentSession | null;
	logs: AgentActivityLog[];
	isStreaming?: boolean;
}

function buildReport(session: AgentSession, logs: AgentActivityLog[]): string {
	const lines: string[] = [];
	lines.push(`## 🤖 Agent Report`);
	lines.push('');
	if (session.branch) lines.push(`**Branch:** \`${session.branch}\``);
	lines.push('');

	for (const log of logs) {
		const time = formatTime(log.created_at);
		const icon =
			log.log_type === 'commit'
				? '📦'
				: log.log_type === 'file_change'
					? '📝'
					: log.log_type === 'error'
						? '❌'
						: log.log_type === 'summary'
							? '📋'
							: 'ℹ️';
		lines.push(`- \`${time}\` ${icon} ${log.content}`);
	}

	lines.push('');
	lines.push('---');
	lines.push('*Published by [Devora](https://github.com)*');
	return lines.join('\n');
}

export default function AgentActivityTab({
	session,
	logs,
	isStreaming = false,
}: AgentActivityTabProps) {
	const [publishing, setPublishing] = useState(false);
	const [published, setPublished] = useState(false);
	const qc = useQueryClient();
	const { showSnackbar } = useSnackbar();
	const { selectedViewMappings } = useProjectConfig();

	// Derive issue context from session DB fields
	const hasIssue = !!(session?.issue_owner && session?.issue_repo && session?.issue_number);
	const alreadyPublished = !!session?.report_published_at;

	const handlePublish = useCallback(async () => {
		if (!session || logs.length === 0) return;
		setPublishing(true);
		try {
			const report = buildReport(session, logs);

			if (hasIssue) {
				// Post comment on issue
				const commentRes = await fetch('/api/github/issue/comment', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						owner: session.issue_owner,
						repo: session.issue_repo,
						issueNumber: session.issue_number,
						body: report,
					}),
				});
				if (!commentRes.ok) return;

				// Push branch + create PR with activity as description
				if (session.branch) {
					// Push branch to remote first
					const pushRes = await fetch('/api/git/push', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							cwd: session.project_path,
							branch: session.branch,
						}),
					});
					if (!pushRes.ok) {
						const pushErr = await pushRes.json().catch(() => ({}));
						console.error('[Publish] Git push failed:', pushErr);
					}

					const prTitle = `${session.branch.replace(/^(feat|fix|refactor|docs|chore|test|perf)\//, '$1: ').replace(/-/g, ' ')}`;
					const prBody = [
						session.issue_number ? `Closes #${session.issue_number}` : '',
						'',
						report,
					]
						.filter(Boolean)
						.join('\n');

					const prRes = await fetch('/api/github/issue/create-pr', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							owner: session.issue_owner,
							repo: session.issue_repo,
							head: session.branch,
							title: prTitle,
							body: prBody,
						}),
					});
					if (!prRes.ok) {
						const prErr = await prRes.json().catch(() => ({}));
						console.error('[Publish] PR creation failed:', prErr);
					}
				}

				// Move issue to Review
				fetch('/api/github/issue/move-status', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						owner: session.issue_owner,
						repo: session.issue_repo,
						issueNumber: session.issue_number,
						newStatus: '🕮 Review',
					}),
				}).catch(() => { });
			}

			setPublished(true);

			// Kill the tmux session
			fetch(`/api/agent-sessions/${encodeURIComponent(session.session_id)}/kill`, {
				method: 'POST',
			}).catch(() => { });

			// Mark session as report published + completed
			await supabase
				.from('agent_sessions')
				.update({
					report_published_at: new Date().toISOString(),
					status: 'completed',
					ended_at: new Date().toISOString(),
				})
				.eq('id', session.id);

			// Resolve view_name from repo
			const repoFull =
				session.issue_owner && session.issue_repo
					? `${session.issue_owner}/${session.issue_repo}`
					: null;
			const viewName = repoFull
				? (selectedViewMappings.find(
					(m) =>
						m.repos?.includes(repoFull) ||
						m.issues?.some(
							(i) => i.repo === repoFull && i.number === session.issue_number,
						),
				)?.viewName ?? null)
				: null;

			// Create notification
			const issueLabel = session.issue_title
				? `${session.issue_repo}#${session.issue_number} ${session.issue_title}`
				: session.project_name;
			await createNotification({
				type: 'report_published',
				title: `Rapport publié — ${issueLabel}`,
				message: `L'agent ${session.agent_name ?? 'Claude'} a terminé et publié son rapport.`,
				issue_owner: session.issue_owner ?? undefined,
				issue_repo: session.issue_repo ?? undefined,
				issue_number: session.issue_number ?? undefined,
				issue_title: session.issue_title ?? undefined,
				session_id: session.session_id,
				view_name: viewName ?? undefined,
			});

			qc.invalidateQueries({ queryKey: ['notifications'] });
			qc.invalidateQueries({ queryKey: ['claude-activity'] });
			qc.invalidateQueries({ queryKey: ['agent-session', session.session_id] });
			qc.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
			qc.invalidateQueries({ queryKey: ['sessions', 'active'] });
			qc.invalidateQueries({ queryKey: ['github', 'dashboard'] });

			showSnackbar(`Rapport publié pour ${session.issue_title ?? session.project_name}`);
		} catch {
			showSnackbar('Erreur lors de la publication du rapport', 'error');
		} finally {
			setPublishing(false);
		}
	}, [session, hasIssue, logs, qc, showSnackbar, selectedViewMappings]);

	if (!session) {
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
					Session loading...
				</Typography>
			</Box>
		);
	}

	const statusColor =
		session.status === 'active'
			? '#4CAF50'
			: session.status === 'error'
				? '#FF5252'
				: '#636B78';

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#1A1A1A' }}>
			{/* Header */}
			<Box
				sx={{
					px: 2,
					py: 1.5,
					borderBottom: 1,
					borderColor: alpha('#fff', 0.06),
					display: 'flex',
					alignItems: 'center',
					gap: 1,
					flexShrink: 0,
				}}
			>
				<FiberManualRecordRoundedIcon sx={{ fontSize: 8, color: statusColor }} />
				<Typography
					variant="caption"
					sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}
				>
					{session.agent_name ?? 'Claude'}
				</Typography>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
					<FolderRoundedIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
					<Typography
						variant="caption"
						sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
					>
						{session.project_name}
					</Typography>
				</Box>
				{session.branch && (
					<Chip
						icon={<AccountTreeRoundedIcon sx={{ fontSize: '11px !important' }} />}
						label={session.branch}
						size="small"
						sx={{
							height: 18,
							fontSize: '0.6rem',
							bgcolor: 'transparent',
							color: alpha('#00E5FF', 0.7),
							'& .MuiChip-icon': { color: alpha('#00E5FF', 0.7) },
						}}
					/>
				)}
				<Chip
					label={session.status}
					size="small"
					sx={{
						ml: 'auto',
						height: 18,
						fontSize: '0.6rem',
						fontWeight: 600,
						bgcolor: 'transparent',
						color: statusColor,
					}}
				/>
			</Box>

			{/* Timeline */}
			<Box sx={{ flex: 1, overflowX: 'hidden', overflowY: 'auto', py: 1 }}>
				{logs.length === 0 && !isStreaming ? (
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							py: 8,
						}}
					>
						<Typography variant="caption" sx={{ color: 'text.disabled' }}>
							No activity yet
						</Typography>
					</Box>
				) : (
					<Box sx={{ position: 'relative' }}>
						{/* Vertical line */}
						<Box
							sx={{
								position: 'absolute',
								left: 52,
								top: 8,
								bottom: 8,
								width: 1,
							}}
						/>

						{logs.map((log) => {
							const color = LOG_TYPE_COLORS[log.log_type];
							return (
								<Box
									key={log.id}
									sx={{
										display: 'flex',
										alignItems: 'flex-start',
										gap: 0,
										py: 0.75,
										px: 2,
										borderBottom: '1px solid',
										borderColor: alpha('#fff', 0.04),
									}}
								>
									{/* Time */}
									<Typography
										variant="caption"
										sx={{
											width: 36,
											flexShrink: 0,
											color: 'text.disabled',
											fontSize: '0.65rem',
											fontFamily: 'monospace',
											pt: 0.15,
										}}
									>
										{formatTime(log.created_at)}
									</Typography>

									{/* Dot */}
									<Box
										sx={{
											width: 7,
											height: 7,
											borderRadius: '50%',
											bgcolor: color,
											flexShrink: 0,
											mt: 0.6,
											mx: 1,
											position: 'relative',
											zIndex: 1,
										}}
									/>

									{/* Content */}
									<Typography
										variant="body2"
										sx={{
											flex: 1,
											fontSize: '0.78rem',
											lineHeight: 1.5,
											color:
												log.log_type === 'error'
													? '#FF5252'
													: 'text.primary',
											whiteSpace: 'pre-wrap',
											wordBreak: 'break-word',
											pl: 1,
										}}
									>
										{log.content}
									</Typography>
								</Box>
							);
						})}

						{/* Streaming indicator */}
						{isStreaming && (
							<Box
								sx={{
									display: 'flex',
									alignItems: 'center',
									py: 0.75,
									px: 2,
								}}
							>
								<Box sx={{ width: 36, flexShrink: 0 }} />
								<Box
									sx={{
										width: 7,
										height: 7,
										borderRadius: '50%',
										bgcolor: '#7C5CFF',
										flexShrink: 0,
										mx: 1,
										position: 'relative',
										zIndex: 1,
										animation: 'pulse 2s ease-in-out infinite',
										'@keyframes pulse': {
											'0%, 100%': { opacity: 0.4 },
											'50%': { opacity: 1 },
										},
									}}
								/>
								<Box
									sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pl: 1 }}
								>
									<SmartToyRoundedIcon
										sx={{ fontSize: 13, color: alpha('#7C5CFF', 0.6) }}
									/>
									<Typography
										variant="caption"
										sx={{ color: alpha('#7C5CFF', 0.6), fontSize: '0.72rem' }}
									>
										working...
									</Typography>
								</Box>
							</Box>
						)}
					</Box>
				)}
			</Box>

			{/* Publish report button — visible when Claude is done */}
			{!isStreaming && logs.length > 0 && (
				<Box
					sx={{
						px: 2,
						py: 1.5,
						borderTop: 1,
						borderColor: alpha('#fff', 0.06),
						flexShrink: 0,
						display: 'flex',
						justifyContent: 'flex-end',
					}}
				>
					<Button
						variant="contained"
						size="small"
						disabled={publishing || published || alreadyPublished}
						onClick={handlePublish}
						startIcon={
							publishing ? (
								<CircularProgress size={14} sx={{ color: 'inherit' }} />
							) : published || alreadyPublished ? (
								<CheckCircleRoundedIcon sx={{ fontSize: 16 }} />
							) : (
								<PublishRoundedIcon sx={{ fontSize: 16 }} />
							)
						}
						sx={{
							textTransform: 'none',
							fontWeight: 600,
							fontSize: '0.78rem',
							bgcolor: published || alreadyPublished ? '#4CAF50' : '#7C5CFF',
							'&:hover': {
								bgcolor:
									published || alreadyPublished
										? '#4CAF50'
										: alpha('#7C5CFF', 0.85),
							},
							'&.Mui-disabled':
								published || alreadyPublished
									? { bgcolor: alpha('#4CAF50', 0.7), color: '#fff' }
									: undefined,
						}}
					>
						{published || alreadyPublished ? 'Rapport publié' : 'Publier le rapport'}
					</Button>
				</Box>
			)}
		</Box>
	);
}
