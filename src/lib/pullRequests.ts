import type { GitHubPullRequest, MergedPrRef } from '@/types';

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

/**
 * Find the merged pull request whose head branch matches `branch`, if any.
 * Used to show the "Merged #N" state (link to GitHub) in the Workbench header.
 */
export function findMergedPrForBranch(
	mergedPrs: MergedPrRef[] | undefined | null,
	branch: string | null | undefined,
): MergedPrRef | undefined {
	if (!mergedPrs || !branch) return undefined;
	return mergedPrs.find((pr) => pr.ref === branch);
}
