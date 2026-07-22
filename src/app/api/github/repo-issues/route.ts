import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projectConfigs } from '@/db/schema';
import { fetchRepoAssignedIssues, fetchProjectColumns } from '@/lib/github';
import {
	resolveConfigForRepo,
	reconcileRepoIssues,
	type CoveringConfig,
} from '@/lib/repoIssueBoard';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const repo = request.nextUrl.searchParams.get('repo');
	if (!repo || !repo.includes('/')) {
		return NextResponse.json(
			{ error: 'repo parameter (owner/name) is required' },
			{ status: 400 },
		);
	}
	const [owner, name] = repo.split('/');

	try {
		const issues = await fetchRepoAssignedIssues(owner, name, auth.login, auth.accessToken);

		const nodeIds = issues.map((i) => i.node_id).filter((id): id is string => !!id);
		const columnsByNodeId = await fetchProjectColumns(nodeIds, auth.accessToken);

		const connected = (
			db
				.select({
					org: projectConfigs.org,
					project_number: projectConfigs.project_number,
					project_title: projectConfigs.project_title,
					status_columns: projectConfigs.status_columns,
					view_repo_mappings: projectConfigs.view_repo_mappings,
					owner_type: projectConfigs.owner_type,
					connected: projectConfigs.connected,
				})
				.from(projectConfigs)
				.all() ?? []
		)
			.filter((c) => c.connected)
			.map((c) => ({
				org: c.org,
				projectNumber: c.project_number,
				ownerType: (c.owner_type ?? undefined) as CoveringConfig['ownerType'],
				projectTitle: c.project_title ?? '',
				statusColumns: (c.status_columns as string[] | null) ?? [],
				viewRepoMappings: (c.view_repo_mappings as { repos?: string[] }[] | null) ?? [],
			}));

		const covering = resolveConfigForRepo(repo, connected);
		const { issues: reconciled, statusColumns } = reconcileRepoIssues(
			issues,
			columnsByNodeId,
			covering,
		);

		return NextResponse.json({
			issues: reconciled,
			statusColumns,
			fetchedAt: new Date().toISOString(),
		});
	} catch (err) {
		// GitHub failure (rate limit…) → empty board + error flag instead of crashing.
		return NextResponse.json({
			issues: [],
			statusColumns: [],
			fetchedAt: null,
			error: err instanceof Error ? err.message : 'fetch_failed',
		});
	}
}
