import type { GitHubIssue } from '@/types';

/** Issues ouvertes uniquement, dédupliquées par node_id (première occurrence gardée). */
export function buildBoardIssues(issues: GitHubIssue[]): GitHubIssue[] {
	const seen = new Set<string>();
	const out: GitHubIssue[] = [];
	for (const it of issues) {
		if (it.state !== 'open') continue;
		if (it.node_id && seen.has(it.node_id)) continue;
		if (it.node_id) seen.add(it.node_id);
		out.push(it);
	}
	return out;
}
