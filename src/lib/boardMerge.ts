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

export interface BoardConfigTag {
	org: string;
	projectNumber: number;
	ownerType?: 'organization' | 'user';
}

export interface BoardIssue extends GitHubIssue {
	__config: BoardConfigTag;
}

/**
 * Merges per-board issue lists into a single tagged list, and unions status columns
 * in config order (deduplicated). Cross-board issue dedup is by `node_id`,
 * keeping the first occurrence (and its config tag).
 */
export function mergeConnectedBoards(
	perConfig: { config: BoardConfigTag & { statusColumns: string[] }; boardIssues: GitHubIssue[] }[],
): { issues: BoardIssue[]; statusColumns: string[] } {
	const seen = new Set<string>();
	const issues: BoardIssue[] = [];
	const cols: string[] = [];
	const colSeen = new Set<string>();
	for (const { config, boardIssues } of perConfig) {
		for (const c of config.statusColumns) {
			if (!colSeen.has(c)) {
				colSeen.add(c);
				cols.push(c);
			}
		}
		for (const it of boardIssues) {
			if (it.node_id && seen.has(it.node_id)) continue;
			if (it.node_id) seen.add(it.node_id);
			issues.push({
				...it,
				__config: {
					org: config.org,
					projectNumber: config.projectNumber,
					ownerType: config.ownerType,
				},
			});
		}
	}
	return { issues, statusColumns: cols };
}
