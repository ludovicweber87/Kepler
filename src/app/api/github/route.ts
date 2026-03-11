import { NextResponse } from 'next/server';
import {
	fetchUserLogin,
	fetchUserRepos,
	fetchAssignedIssues,
	fetchProjectColumns,
	fetchSpecificIssues,
} from '@/lib/github';
import { DashboardData, ViewIssueRef } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		// Fetch issues first, then enrich in parallel with repos/user
		const issuesPromise = fetchAssignedIssues();

		// Start user + repos in parallel immediately
		const userPromise = fetchUserLogin();
		const reposPromise = fetchUserRepos();

		// As soon as issues arrive, start enrichment in parallel
		const issues = await issuesPromise;
		const nodeIds = issues.map((i) => i.node_id).filter(Boolean);

		const [user, repos, columnsMap] = await Promise.all([
			userPromise,
			reposPromise,
			fetchProjectColumns(nodeIds),
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
	try {
		const body = await request.json();
		const refs: ViewIssueRef[] = body.issues;

		if (!Array.isArray(refs) || refs.length === 0) {
			return NextResponse.json({ error: 'issues array required' }, { status: 400 });
		}

		// Start user fetch in parallel immediately
		const userPromise = fetchUserLogin();

		// Fetch issues, then enrich in parallel with user
		const issues = await fetchSpecificIssues(refs);
		const nodeIds = issues.map((i) => i.node_id).filter(Boolean);

		const [user, columnsMap] = await Promise.all([
			userPromise,
			fetchProjectColumns(nodeIds),
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
