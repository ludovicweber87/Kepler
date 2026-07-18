import { describe, it, expect } from 'vitest';
import { diffGithubState, type GithubState } from './diff.js';

const empty: GithubState = { prs: {}, threads: {} };
const pr = (over: Partial<import('./diff.js').PrSnapshot> = {}): import('./diff.js').PrSnapshot => ({
	repo: 'o/r', number: 42, url: 'https://gh/pr/42', title: 'PR', headSha: 'sha1',
	checkStatus: 'pending', reviewDecision: null, merged: false, ...over,
});

describe('diffGithubState', () => {
	it('emits nothing when prev == next', () => {
		const s: GithubState = { prs: { 'o/r#42': pr() }, threads: {} };
		expect(diffGithubState(s, s)).toEqual([]);
	});

	it('emits ci_failed when checks go pending -> failure (keyed by sha)', () => {
		const prev: GithubState = { prs: { 'o/r#42': pr({ checkStatus: 'pending' }) }, threads: {} };
		const next: GithubState = { prs: { 'o/r#42': pr({ checkStatus: 'failure' }) }, threads: {} };
		const out = diffGithubState(prev, next);
		expect(out).toHaveLength(1);
		expect(out[0].type).toBe('ci_failed');
		expect(out[0].dedupe_key).toBe('ci_failed:o/r#42:sha1');
	});

	it('emits ci_passed on failure -> success', () => {
		const prev: GithubState = { prs: { 'o/r#42': pr({ checkStatus: 'failure' }) }, threads: {} };
		const next: GithubState = { prs: { 'o/r#42': pr({ checkStatus: 'success' }) }, threads: {} };
		expect(diffGithubState(prev, next)[0].type).toBe('ci_passed');
	});

	it('emits pr_merged when merged flips true', () => {
		const prev: GithubState = { prs: { 'o/r#42': pr({ merged: false }) }, threads: {} };
		const next: GithubState = { prs: { 'o/r#42': pr({ merged: true }) }, threads: {} };
		const out = diffGithubState(prev, next);
		expect(out.map(n => n.type)).toContain('pr_merged');
		expect(out.find(n => n.type === 'pr_merged')!.dedupe_key).toBe('pr_merged:o/r#42');
	});

	it('emits pr_approved / changes_requested on review decision change', () => {
		const prev: GithubState = { prs: { 'o/r#42': pr({ reviewDecision: 'REVIEW_REQUIRED' }) }, threads: {} };
		const approved = diffGithubState(prev, { prs: { 'o/r#42': pr({ reviewDecision: 'APPROVED' }) }, threads: {} });
		expect(approved.map(n => n.type)).toContain('pr_approved');
		const changes = diffGithubState(prev, { prs: { 'o/r#42': pr({ reviewDecision: 'CHANGES_REQUESTED' }) }, threads: {} });
		expect(changes.map(n => n.type)).toContain('changes_requested');
	});

	it('emits a github notif for a new thread, keyed by thread id', () => {
		const next: GithubState = { prs: {}, threads: { t1: { id: 't1', reason: 'mention', title: 'hi', url: 'u', repo: 'o/r' } } };
		const out = diffGithubState(empty, next);
		expect(out).toHaveLength(1);
		expect(out[0].type).toBe('mention');
		expect(out[0].dedupe_key).toBe('mention:t1');
	});

	it('maps review_requested reason to review_requested type', () => {
		const next: GithubState = { prs: {}, threads: { t2: { id: 't2', reason: 'review_requested', title: 'r', url: 'u', repo: 'o/r' } } };
		expect(diffGithubState(empty, next)[0].type).toBe('review_requested');
	});

	it('does not re-emit an existing thread', () => {
		const s: GithubState = { prs: {}, threads: { t1: { id: 't1', reason: 'mention', title: 'hi', url: 'u', repo: 'o/r' } } };
		expect(diffGithubState(s, s)).toEqual([]);
	});
});
