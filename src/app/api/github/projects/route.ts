import { NextRequest, NextResponse } from 'next/server';
import {
	fetchOrgProjects,
	fetchProjectV2Data,
	fetchViewerOrgProjects,
	fetchUserLogin,
	projectItemToIssue,
} from '@/lib/github';
import { mapViewsToRepos } from '@/lib/projectViews';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { readSnapshot, writeSnapshot, type ProjectBoardPayload } from '@/lib/projectBoardCache';
import { buildBoardIssues } from '@/lib/boardMerge';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { searchParams } = request.nextUrl;
		const org = searchParams.get('org');
		const projectNumber = searchParams.get('projectNumber');

		if (!org && !projectNumber) {
			const orgProjects = await fetchViewerOrgProjects(auth.accessToken);
			return NextResponse.json({ orgProjects });
		}

		if (!org) {
			return NextResponse.json({ error: 'org parameter is required' }, { status: 400 });
		}

		const ownerType = (searchParams.get('ownerType') === 'user' ? 'user' : 'organization') as
			| 'organization'
			| 'user';

		if (!projectNumber) {
			const projects = await fetchOrgProjects(org, auth.accessToken);
			return NextResponse.json({ projects });
		}

		const num = parseInt(projectNumber, 10);
		if (isNaN(num)) {
			return NextResponse.json({ error: 'projectNumber must be a number' }, { status: 400 });
		}

		const refresh = searchParams.get('refresh') === '1';

		// Read-through cache: serve the SQLite snapshot unless an explicit refresh is requested.
		if (!refresh) {
			const snap = readSnapshot(org, num);
			if (snap) {
				return NextResponse.json({ ...snap.payload, fetchedAt: snap.fetchedAt });
			}
		}

		// Explicit refresh OR cache-miss → fetch GitHub (the only path that hits the API).
		try {
			let projectData;
			try {
				projectData = await fetchProjectV2Data(org, num, auth.accessToken, ownerType);
			} catch {
				const fallback = ownerType === 'organization' ? 'user' : 'organization';
				projectData = await fetchProjectV2Data(org, num, auth.accessToken, fallback);
			}
			const viewRepoMappings = mapViewsToRepos(projectData.views, projectData.items);

			// Assigned-to-viewer items, mapped to the GitHubIssue shape (issues + PRs) —
			// the board renders straight from this.
			const viewer = (await fetchUserLogin(auth.accessToken)).toLowerCase();
			const allMine = projectData.items
				.filter((it) => it.assignees.some((a) => a.login.toLowerCase() === viewer))
				.map((it) => projectItemToIssue(it, projectData.title));
			const boardIssues = buildBoardIssues(allMine);

			const payload: ProjectBoardPayload = {
				project: {
					id: projectData.id,
					title: projectData.title,
					number: projectData.number,
				},
				views: projectData.views,
				viewRepoMappings,
				statusColumns: projectData.statusColumns,
				boardIssues,
			};
			const fetchedAt = writeSnapshot(org, num, payload);
			return NextResponse.json({ ...payload, fetchedAt });
		} catch (fetchErr) {
			// Cache-miss + GitHub failed (e.g. rate limit): return an empty board with an
			// error flag instead of crashing — the UI shows a retry hint.
			return NextResponse.json({
				project: null,
				views: [],
				viewRepoMappings: [],
				statusColumns: [],
				boardIssues: [],
				fetchedAt: null,
				error: fetchErr instanceof Error ? fetchErr.message : 'fetch_failed',
			});
		}
	} catch (err) {
		console.error('Projects API error:', err);
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			{ status: 500 },
		);
	}
}
