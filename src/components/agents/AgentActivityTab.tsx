'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
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
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { useSnackbar } from '@/hooks/useSnackbar';
import { usePublishPhase } from '@/hooks/usePublishPhase';
import { localFetch } from '@/lib/local-fetch';
import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';
import { buildReport, formatTime } from '@/lib/activityReport';
import { getPublishPhase } from '@/lib/publishReportState';
import ActivityMarkdown, { LOG_TYPE_COLORS } from './ActivityMarkdown';

interface AgentActivityTabProps {
	session: AgentSession | null;
	logs: AgentActivityLog[];
	isStreaming?: boolean;
	/** Ouvre le lecteur markdown pleine largeur du flux d'activité. */
	onOpenReader?: () => void;
}

export default function AgentActivityTab({
	session,
	logs,
	isStreaming = false,
	onOpenReader,
}: AgentActivityTabProps) {
	const t = useTranslations('agentActivity');
	// Phase gardée hors du composant : le panneau droit n'est pas remonté d'une session
	// à l'autre, donc un état local afficherait le spinner d'un worktree sur le bouton
	// d'un autre. Deux sessions peuvent publier en parallèle.
	const { setPhase, publishing, synthesizing, published } = usePublishPhase(
		session?.session_id ?? '',
	);
	const qc = useQueryClient();
	const { showSnackbar } = useSnackbar();
	// Activity ne montre qu'un récap des actions de l'agent : les summary (récap de
	// fin de tour) et les error. Jamais les logs d'outils bruts (info/file_change/commit).
	const visibleLogs = logs.filter((l) => l.log_type === 'summary' || l.log_type === 'error');
	// Derive issue context from session DB fields
	const hasIssue = !!(session?.issue_owner && session?.issue_repo && session?.issue_number);
	const alreadyPublished = !!session?.report_published_at;

	const handlePublish = useCallback(async () => {
		if (!session || visibleLogs.length === 0) return;
		// Capturé une fois : tous les `setPhase` ci-dessous ciblent la session qui a lancé
		// la publication, même si l'utilisateur change de worktree entre-temps.
		const sid = session.session_id;
		setPhase(sid, 'publishing');
		try {
			// Le publish pousse la branche telle quelle : du travail non commité
			// produirait une PR vide. On bloque avant de dépenser la synthèse.
			const workingDir = session.worktree_path ?? session.project_path;
			if (hasIssue && session.branch && workingDir) {
				const statusRes = await localFetch(
					`/git/status?cwd=${encodeURIComponent(workingDir)}`,
				);
				const status = (await statusRes.json().catch(() => ({}))) as {
					dirty?: boolean;
					count?: number;
				};
				if (statusRes.ok && status.dirty) {
					showSnackbar(t('uncommittedChanges', { count: status.count ?? 0 }), 'warning');
					return;
				}
			}

			let report: string;
			setPhase(sid, 'synthesizing');
			const rawReport = () =>
				buildReport(session, visibleLogs, {
					reportTitle: t('reportTitle'),
					branch: t('branch'),
				});
			try {
				const synthRes = await localFetch(
					`/agent-sessions/${session.session_id}/synthesize-report`,
					{ method: 'POST' },
				);
				const synthData = (await synthRes.json().catch(() => ({}))) as { report?: string };
				if (synthRes.ok && synthData.report && synthData.report.trim()) {
					report = synthData.report;
				} else {
					showSnackbar(t('synthesizeError'), 'info');
					report = rawReport();
				}
			} catch {
				showSnackbar(t('synthesizeError'), 'info');
				report = rawReport();
			} finally {
				setPhase(sid, 'publishing');
			}

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
				if (!commentRes.ok) {
					const commentErr = await commentRes.json().catch(() => ({}));
					console.error('[Publish] Issue comment failed:', commentErr);
					showSnackbar(t('commentError'), 'error');
					return;
				}

				// Push branch + create PR with activity as description
				if (session.branch) {
					// Push branch to remote first
					const pushRes = await localFetch('/git/push', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							cwd: workingDir ?? session.project_path,
							branch: session.branch,
						}),
					});
					if (!pushRes.ok) {
						const pushErr = await pushRes.json().catch(() => ({}));
						console.error('[Publish] Git push failed:', pushErr);
						// Sans push, la PR échouerait de toute façon : on s'arrête ici
						// pour que la session reste publiable après correction.
						showSnackbar(t('pushError'), 'error');
						return;
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
						showSnackbar(t('prError'), 'error');
						return;
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
				}).catch(() => {});
			}

			setPhase(sid, 'published');

			// Mark session as report published (do NOT kill — user decides when to close)
			await apiFetch('/api/agent-sessions', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: session.id,
					report_published_at: new Date().toISOString(),
				}),
			});

			qc.invalidateQueries({ queryKey: ['agent-session-logs', session.id] });
			qc.invalidateQueries({ queryKey: ['agent-session', session.session_id] });
			qc.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
			qc.invalidateQueries({ queryKey: ['sessions', 'active'] });
			qc.invalidateQueries({ queryKey: ['github', 'dashboard'] });

			// Refetch the issue to show the new comment immediately
			if (hasIssue) {
				qc.invalidateQueries({
					queryKey: [
						'github',
						'issue',
						session.issue_owner,
						session.issue_repo,
						session.issue_number,
					],
				});
				qc.invalidateQueries({
					queryKey: [
						'github',
						'issue-timeline',
						session.issue_owner,
						session.issue_repo,
						session.issue_number,
					],
				});
			}

			showSnackbar(
				t('reportPublishedFor', { name: session.issue_title ?? session.project_name }),
			);
		} catch {
			showSnackbar(t('publishError'), 'error');
		} finally {
			// La phase 'published' est terminale : ne pas l'écraser en sortie de try.
			if (getPublishPhase(sid) !== 'published') setPhase(sid, 'idle');
		}
	}, [session, hasIssue, visibleLogs, qc, showSnackbar, t, setPhase]);

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
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				height: '100%',
				bgcolor: 'background.default',
			}}
		>
			{/* Header */}
			<Box
				sx={{
					px: 2,
					py: 1.5,
					borderBottom: 1,
					borderColor: 'divider',
					display: 'flex',
					flexDirection: 'column',
					gap: 0.75,
					flexShrink: 0,
				}}
			>
				{/* Rangée 1 : nom (ne casse jamais) */}
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
					<FiberManualRecordRoundedIcon
						sx={{ fontSize: 8, color: statusColor, flexShrink: 0 }}
					/>
					<Typography
						variant="caption"
						sx={{
							fontWeight: 600,
							color: 'text.secondary',
							fontSize: '0.75rem',
							flex: 1,
							minWidth: 0,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{session.agent_name ?? 'Claude'}
					</Typography>
					{visibleLogs.length > 0 && onOpenReader && (
						<Button
							size="small"
							onClick={onOpenReader}
							startIcon={<MenuBookRoundedIcon sx={{ fontSize: 14 }} />}
							sx={{
								flexShrink: 0,
								textTransform: 'none',
								fontSize: '0.7rem',
								fontWeight: 600,
								py: 0.25,
								minWidth: 0,
								color: 'text.secondary',
							}}
						>
							{t('view')}
						</Button>
					)}
				</Box>
				{/* Rangée 2 : dossier · worktree · statut */}
				<Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
						<FolderRoundedIcon
							sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }}
						/>
						<Typography
							variant="caption"
							sx={{
								color: 'text.disabled',
								fontSize: '0.7rem',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}
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
								maxWidth: '100%',
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
							height: 18,
							fontSize: '0.6rem',
							fontWeight: 600,
							bgcolor: 'transparent',
							color: statusColor,
						}}
					/>
				</Box>
			</Box>

			{/* Timeline */}
			<Box sx={{ flex: 1, overflowX: 'hidden', overflowY: 'auto', py: 1 }}>
				{visibleLogs.length === 0 && !isStreaming ? (
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

						{visibleLogs.map((log) => {
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

									{/* Content (markdown) */}
									<ActivityMarkdown
										content={log.content}
										error={log.log_type === 'error'}
									/>
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
										sx={(theme) => ({
											fontSize: 13,
											color: alpha(theme.palette.primary.main, 0.6),
										})}
									/>
									<Typography
										variant="caption"
										sx={(theme) => ({
											color: alpha(theme.palette.primary.main, 0.6),
											fontSize: '0.72rem',
										})}
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
			{/* `visibleLogs` et non `logs` : le handler refuse de publier sans résumé,
			    afficher le bouton sur des logs bruts produisait un clic sans effet. */}
			{!isStreaming && visibleLogs.length > 0 && hasIssue && (
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
							bgcolor:
								published || alreadyPublished
									? theme.palette.success.main
									: theme.palette.primary.main,
							'&:hover': {
								bgcolor:
									published || alreadyPublished
										? theme.palette.success.main
										: theme.palette.primary.dark,
							},
							'&.Mui-disabled':
								published || alreadyPublished
									? {
											bgcolor: alpha(theme.palette.success.main, 0.7),
											color: theme.palette.text.primary,
										}
									: undefined,
						})}
					>
						{published || alreadyPublished
							? t('reportPublished')
							: synthesizing
								? t('synthesizing')
								: t('publishReport')}
					</Button>
				</Box>
			)}
		</Box>
	);
}
