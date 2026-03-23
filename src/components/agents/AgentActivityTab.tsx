'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import PublishRoundedIcon from '@mui/icons-material/PublishRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { useSnackbar } from '@/hooks/useSnackbar';
import { localFetch } from '@/lib/local-fetch';
import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';

const LOG_TYPE_COLORS: Record<AgentActivityLog['log_type'], string> = {
	info: 'text.disabled',
	commit: 'success.main',
	file_change: 'warning.main',
	error: 'error.main',
	summary: 'primary.main',
	ask_question: 'warning.main',
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

function buildReport(session: AgentSession, logs: AgentActivityLog[], labels: { reportTitle: string; branch: string }): string {
	const lines: string[] = [];
	lines.push(`## 🤖 ${labels.reportTitle}`);
	lines.push('');
	if (session.branch) lines.push(`**${labels.branch}:** \`${session.branch}\``);
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
							: log.log_type === 'ask_question'
								? '❓'
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
	const t = useTranslations('agentActivity');
	const [publishing, setPublishing] = useState(false);
	const [published, setPublished] = useState(false);
	const qc = useQueryClient();
	const { showSnackbar } = useSnackbar();
	// Derive issue context from session DB fields
	const hasIssue = !!(session?.issue_owner && session?.issue_repo && session?.issue_number);
	const alreadyPublished = !!session?.report_published_at;

	const handlePublish = useCallback(async () => {
		if (!session || logs.length === 0) return;
		setPublishing(true);
		try {
			const report = buildReport(session, logs, {
				reportTitle: t('reportTitle'),
				branch: t('branch'),
			});

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
					const pushRes = await localFetch('/git/push', {
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

			// Mark session as report published (do NOT kill — user decides when to close)
			await apiFetch('/api/agent-sessions', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: session.id,
					report_published_at: new Date().toISOString(),
				}),
			});

			qc.invalidateQueries({ queryKey: ['claude-activity'] });
			qc.invalidateQueries({ queryKey: ['agent-session', session.session_id] });
			qc.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
			qc.invalidateQueries({ queryKey: ['sessions', 'active'] });
			qc.invalidateQueries({ queryKey: ['github', 'dashboard'] });

			// Refetch the issue to show the new comment immediately
			if (hasIssue) {
				qc.invalidateQueries({ queryKey: ['github', 'issue', session.issue_owner, session.issue_repo, session.issue_number] });
				qc.invalidateQueries({ queryKey: ['github', 'issue-timeline', session.issue_owner, session.issue_repo, session.issue_number] });
			}

			showSnackbar(t('reportPublishedFor', { name: session.issue_title ?? session.project_name }));
		} catch {
			showSnackbar(t('publishError'), 'error');
		} finally {
			setPublishing(false);
		}
	}, [session, hasIssue, logs, qc, showSnackbar]);

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
					{t('sessionLoading')}
				</Typography>
			</Box>
		);
	}

	const statusColor =
		session.status === 'active'
			? 'success.main'
			: session.status === 'error'
				? 'error.main'
				: 'text.disabled';

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default' }}>
			{/* Header */}
			<Box
				sx={{
					px: 2,
					py: 1.5,
					borderBottom: 1,
					borderColor: 'divider',
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
							color: 'secondary.main',
							'& .MuiChip-icon': { color: 'secondary.main' },
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
							{t('noActivity')}
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
										borderColor: 'divider',
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
													? 'error.main'
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
										bgcolor: 'primary.main',
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
										sx={(theme) => ({ fontSize: 13, color: alpha(theme.palette.primary.main, 0.6) })}
									/>
									<Typography
										variant="caption"
										sx={(theme) => ({ color: alpha(theme.palette.primary.main, 0.6), fontSize: '0.72rem' })}
									>
										{t('inProgress')}
									</Typography>
								</Box>
							</Box>
						)}
					</Box>
				)}
			</Box>

			{/* Publish report button — visible when Claude is done and issue is linked */}
			{!isStreaming && logs.length > 0 && hasIssue && (
				<Box
					sx={{
						px: 2,
						py: 1.5,
						borderTop: 1,
						borderColor: 'divider',
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
						sx={(theme) => ({
							textTransform: 'none',
							fontWeight: 600,
							fontSize: '0.78rem',
							bgcolor: published || alreadyPublished ? theme.palette.success.main : theme.palette.primary.main,
							'&:hover': {
								bgcolor:
									published || alreadyPublished
										? theme.palette.success.main
										: theme.palette.primary.dark,
							},
							'&.Mui-disabled':
								published || alreadyPublished
									? { bgcolor: alpha(theme.palette.success.main, 0.7), color: theme.palette.text.primary }
									: undefined,
						})}
					>
						{published || alreadyPublished ? t('reportPublished') : t('publishReport')}
					</Button>
				</Box>
			)}
		</Box>
	);
}
