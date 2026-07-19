import type { AgentSession } from '@/hooks/useAgentSession';

export type TriageSession = Pick<
	AgentSession,
	'session_id' | 'issue_owner' | 'issue_repo' | 'issue_number' | 'archived_at'
>;

export interface MergeTriagePlan {
	/** Déplacement d'issue à effectuer, ou null (pas d'issue liée ou colonne QA non configurée). */
	issueMove: { owner: string; repo: string; issueNumber: number; newStatus: string } | null;
	/** Session à archiver (soft), ou null (aucune session liée, ou déjà archivée). */
	archiveSessionId: string | null;
}

const NONE: MergeTriagePlan = { issueMove: null, archiveSessionId: null };

/**
 * Décide, au merge d'une PR, ce qu'il faut faire de l'issue et du worktree liés.
 * Ne s'applique qu'aux sessions rattachées à une issue (PR « associée à une issue »).
 * Fonction pure : aucun effet de bord, testable isolément.
 */
export function planMergeTriage(
	session: TriageSession | null | undefined,
	qaColumn: string | null | undefined,
): MergeTriagePlan {
	if (!session) return NONE;

	const hasIssue = !!(session.issue_owner && session.issue_repo && session.issue_number);
	if (!hasIssue) return NONE;

	const column = (qaColumn ?? '').trim();
	const issueMove = column
		? {
				owner: session.issue_owner as string,
				repo: session.issue_repo as string,
				issueNumber: session.issue_number as number,
				newStatus: column,
			}
		: null;

	// On n'archive pas une session déjà archivée (idempotence si merge rejoué).
	const archiveSessionId = session.archived_at ? null : session.session_id;

	return { issueMove, archiveSessionId };
}
