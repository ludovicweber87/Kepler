import { describe, it, expect } from 'vitest';
import { findOpenPrForBranch } from './pullRequests';
import type { GitHubPullRequest } from '@/types';

const pr = (ref: string, state: 'open' | 'closed', number = 1) =>
	({
		number,
		state,
		head: { ref, sha: 'x', label: ref },
		html_url: `https://github.com/o/r/pull/${number}`,
	}) as unknown as GitHubPullRequest;

describe('findOpenPrForBranch', () => {
	it('returns the open PR matching the branch', () => {
		const prs = [pr('other', 'open', 1), pr('feat/x', 'open', 2)];
		expect(findOpenPrForBranch(prs, 'feat/x')?.number).toBe(2);
	});

	it('ignores closed/merged PRs on the branch', () => {
		expect(findOpenPrForBranch([pr('feat/x', 'closed')], 'feat/x')).toBeUndefined();
	});

	it('returns undefined when no PR matches the branch', () => {
		expect(findOpenPrForBranch([pr('other', 'open')], 'feat/x')).toBeUndefined();
	});

	it('returns undefined for empty/nullish inputs', () => {
		expect(findOpenPrForBranch(undefined, 'feat/x')).toBeUndefined();
		expect(findOpenPrForBranch([], 'feat/x')).toBeUndefined();
		expect(findOpenPrForBranch([pr('feat/x', 'open')], null)).toBeUndefined();
	});
});
