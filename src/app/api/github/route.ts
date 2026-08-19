import { NextResponse } from 'next/server';
import {
	fetchUserLogin,
	fetchUserRepos,
	fetchAssignedIssues,
	fetchProjectColumns,
	fetchSpecificIssues,
} from '@/lib/github';
import { DashboardData, ViewIssueRef } from '@/types';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { accessToken } = auth;

		const issuesPromise = fetchAssignedIssues(accessToken);
		const userPromise = fetchUserLogin(accessToken);
		const reposPromise = fetchUserRepos(accessToken);

		const issues = await issuesPromise;
		const nodeIds = issues.map((i) => i.node_id).filter(Boolean);

		const [user, repos, columnsMap] = await Promise.all([
			userPromise,
			reposPromise,
			fetchProjectColumns(nodeIds, accessToken),
		]);

		const enrichedIssues = issues.map((issue) => ({
			...issue,
			project_columns: columnsMap.get(issue.node_id) ?? [],
		}));

		const data: DashboardData = { repos, issues: enrichedIssues, user };
		return NextResponse.json(data);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(request: Request) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { accessToken } = auth;
		const body = await request.json();
		const refs: ViewIssueRef[] = body.issues;

		if (!Array.isArray(refs) || refs.length === 0) {
			return NextResponse.json({ error: 'issues array required' }, { status: 400 });
		}

		const userPromise = fetchUserLogin(accessToken);
		const issues = await fetchSpecificIssues(refs, accessToken);
		const nodeIds = issues.map((i) => i.node_id).filter(Boolean);

		const [user, columnsMap] = await Promise.all([
			userPromise,
			fetchProjectColumns(nodeIds, accessToken),
		]);

		const enrichedIssues = issues.map((issue) => ({
			...issue,
			project_columns: columnsMap.get(issue.node_id) ?? [],
		}));

		const data: DashboardData = { repos: [], issues: enrichedIssues, user };
		return NextResponse.json(data);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
