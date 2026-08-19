import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-fetch';
import { planMergeTriage } from '@/lib/mergeTriage';
import { useSessionActions } from '@/hooks/useSessionActions';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { AgentSession } from '@/hooks/useAgentSession';
import type { GitHubPullRequest, RepoSettings } from '@/types';

/**
 * Après le merge d'une PR liée à une issue (via un worktree Kepler) : déplace l'issue
 * vers la colonne configurée (`repo_settings.qa_column`) puis archive le worktree.
 * Best-effort : le merge a déjà réussi, aucune étape ne doit bloquer ou lever.
 */
export function usePostMergeTriage() {
	const qc = useQueryClient();
	const { showSnackbar } = useSnackbar();
	const { archive } = useSessionActions();
	const t = useTranslations('prs');

	const runForMergedPr = useCallback(
		async (pr: GitHubPullRequest) => {
			const branch = pr.head?.ref;
			if (!branch) return;

			try {
				// 1. Session liée à la branche mergée (la plus récente).
				const sRes = await apiFetch(
					`/api/agent-sessions?branch=${encodeURIComponent(branch)}`,
				);
				const sessions = sRes.ok ? ((await sRes.json()) as AgentSession[]) : [];
				const session = Array.isArray(sessions) ? (sessions[0] ?? null) : null;

				// 2. Colonne QA configurée pour le repo.
				const stRes = await apiFetch(
					`/api/repo-settings?repo=${encodeURIComponent(pr.repo_full_name)}`,
				);
				const settings = stRes.ok ? ((await stRes.json()) as RepoSettings) : null;

				const plan = planMergeTriage(session, settings?.qa_column);

				// Feedback explicite quand aucun déplacement n'aura lieu (sinon silence trompeur).
				const hasIssue = !!(
					session?.issue_owner &&
					session?.issue_repo &&
					session?.issue_number
				);
				if (!session || !hasIssue) {
					showSnackbar(t('mergeTriageNoLink'), 'info');
				} else if (!plan.issueMove) {
					showSnackbar(
						t('mergeTriageNoColumn', { number: session.issue_number as number }),
						'info',
					);
				}

				// 3. Déplacer l'issue vers la colonne QA.
				if (plan.issueMove) {
					try {
						const mv = await apiFetch('/api/github/issue/move-status', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(plan.issueMove),
						});
						if (mv.ok) {
							qc.invalidateQueries({ queryKey: ['repo-issues'] });
							qc.invalidateQueries({ queryKey: ['github', 'dashboard'] });
							showSnackbar(
								t('issueMovedToColumn', {
									number: plan.issueMove.issueNumber,
									column: plan.issueMove.newStatus,
								}),
								'success',
							);
						} else {
							showSnackbar(
								t('issueMoveFailed', { number: plan.issueMove.issueNumber }),
								'warning',
							);
						}
					} catch {
						showSnackbar(
							t('issueMoveFailed', { number: plan.issueMove.issueNumber }),
							'warning',
						);
					}
				}

				// 4. Archiver le worktree (soft : garde le disque).
				if (plan.archiveSessionId) {
					try {
						await archive(plan.archiveSessionId);
						if (session?.project_path) {
							qc.invalidateQueries({
								queryKey: ['git-worktrees', session.project_path],
							});
						}
						showSnackbar(t('worktreeArchived'), 'success');
					} catch {
						showSnackbar(t('worktreeArchiveFailed'), 'warning');
					}
				}
			} catch {
				/* best-effort : le merge a réussi, on n'interrompt pas le flux */
			}
		},
		[qc, showSnackbar, archive, t],
	);

	return { runForMergedPr };
}
