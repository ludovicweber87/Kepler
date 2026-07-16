import type { GitHubPullRequest } from '@/types';

/**
 * Find the open pull request whose head branch matches `branch`, if any.
 * Closed/merged PRs are ignored so the "Create PR" action stays available
 * once a branch's PR is no longer open.
 */
export function findOpenPrForBranch(
	prs: GitHubPullRequest[] | undefined | null,
	branch: string | null | undefined,
): GitHubPullRequest | undefined {
	if (!prs || !branch) return undefined;
	return prs.find((pr) => pr.state === 'open' && pr.head.ref === branch);
}
