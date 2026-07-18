import { buildNotification } from './build.js';
import type { NewNotification, NotificationType } from './types.js';

export interface PrSnapshot {
	repo: string; number: number; url: string; title: string; headSha: string;
	checkStatus: 'pending' | 'success' | 'failure' | null;
	reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
	merged: boolean;
}
export interface NotifThreadSnapshot { id: string; reason: string; title: string; url: string; repo: string; }
export interface GithubState { prs: Record<string, PrSnapshot>; threads: Record<string, NotifThreadSnapshot>; }

function threadType(reason: string): NotificationType {
	return reason === 'review_requested' ? 'review_requested' : 'mention';
}

export function diffGithubState(prev: GithubState, next: GithubState): NewNotification[] {
	const out: NewNotification[] = [];

	for (const [key, pr] of Object.entries(next.prs)) {
		const before = prev.prs[key];
		const ref = `${pr.repo}#${pr.number}`;
		const entityRef = { kind: 'pr' as const, id: String(pr.number), repo: pr.repo };
		const payload = { repo: pr.repo, number: String(pr.number), title: pr.title };

		// CI transitions (dedupe includes sha → stable across reboots, re-fires on new sha)
		if (before && before.checkStatus !== pr.checkStatus) {
			if (pr.checkStatus === 'failure') {
				out.push(buildNotification({ type: 'ci_failed', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref, pr.headSha] }));
			} else if (pr.checkStatus === 'success' && before.checkStatus === 'failure') {
				out.push(buildNotification({ type: 'ci_passed', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref, pr.headSha] }));
			}
		}
		// Merge
		if (before && !before.merged && pr.merged) {
			out.push(buildNotification({ type: 'pr_merged', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref] }));
		}
		// Review decision
		if (before && before.reviewDecision !== pr.reviewDecision) {
			if (pr.reviewDecision === 'APPROVED') {
				out.push(buildNotification({ type: 'pr_approved', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref] }));
			} else if (pr.reviewDecision === 'CHANGES_REQUESTED') {
				out.push(buildNotification({ type: 'changes_requested', title: '', url: pr.url, entityRef, payload, dedupeParts: [ref] }));
			}
		}
	}

	for (const [id, th] of Object.entries(next.threads)) {
		if (prev.threads[id]) continue;
		const type = threadType(th.reason);
		out.push(buildNotification({
			type, title: th.title, url: th.url,
			entityRef: { kind: 'issue', id, repo: th.repo },
			payload: { repo: th.repo, title: th.title }, dedupeParts: [id],
		}));
	}

	return out;
}
