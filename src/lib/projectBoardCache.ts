import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { GitHubIssue, ProjectV2View, ViewRepoMapping } from '@/types';

/** Cached board snapshot payload — everything the board needs to render offline. */
export interface ProjectBoardPayload {
	project: { id: string; title: string; number: number } | null;
	views: ProjectV2View[];
	viewRepoMappings: ViewRepoMapping[];
	statusColumns: string[];
	boardIssuesByView: Record<string, GitHubIssue[]>;
	boardIssues: GitHubIssue[];
	error?: string;
}

export function readSnapshot(
	org: string,
	projectNumber: number,
): { payload: ProjectBoardPayload; fetchedAt: string | null } | null {
	const row = db
		.select()
		.from(schema.projectBoards)
		.where(
			and(
				eq(schema.projectBoards.org, org),
				eq(schema.projectBoards.project_number, projectNumber),
			),
		)
		.get();
	if (!row?.payload) return null;
	return { payload: row.payload as ProjectBoardPayload, fetchedAt: row.fetched_at };
}

export function writeSnapshot(
	org: string,
	projectNumber: number,
	payload: ProjectBoardPayload,
): string {
	const now = new Date().toISOString();
	db.insert(schema.projectBoards)
		.values({ org, project_number: projectNumber, payload, fetched_at: now })
		.onConflictDoUpdate({
			target: [schema.projectBoards.org, schema.projectBoards.project_number],
			set: { payload, fetched_at: now },
		})
		.run();
	return now;
}

/** Move an issue to a new status column inside the cached snapshot (keeps cache ↔ GitHub coherent). */
export function patchSnapshotStatus(
	org: string,
	projectNumber: number,
	issueNodeId: string,
	newStatus: string,
): void {
	const snap = readSnapshot(org, projectNumber);
	if (!snap?.payload?.boardIssuesByView) return;

	const map = snap.payload.boardIssuesByView;
	let changed = false;
	for (const view of Object.keys(map)) {
		map[view] = map[view].map((issue) => {
			if (issue.node_id !== issueNodeId) return issue;
			changed = true;
			return {
				...issue,
				project_columns: issue.project_columns?.length
					? issue.project_columns.map((c) => ({ ...c, column: newStatus }))
					: [{ project: '', column: newStatus }],
			};
		});
	}

	if (Array.isArray(snap.payload.boardIssues)) {
		snap.payload.boardIssues = snap.payload.boardIssues.map((issue) => {
			if (issue.node_id !== issueNodeId) return issue;
			changed = true;
			return {
				...issue,
				project_columns: issue.project_columns?.length
					? issue.project_columns.map((c) => ({ ...c, column: newStatus }))
					: [{ project: '', column: newStatus }],
			};
		});
	}

	if (changed) writeSnapshot(org, projectNumber, snap.payload);
}
