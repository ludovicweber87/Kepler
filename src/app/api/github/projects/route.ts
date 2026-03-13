import { NextRequest, NextResponse } from 'next/server';
import { fetchOrgProjects, fetchProjectV2Data, fetchViewerOrgProjects } from '@/lib/github';
import { mapViewsToRepos } from '@/lib/projectViews';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

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

		const ownerType = (searchParams.get('ownerType') === 'user' ? 'user' : 'organization') as 'organization' | 'user';

		if (!projectNumber) {
			const projects = await fetchOrgProjects(org, auth.accessToken);
			return NextResponse.json({ projects });
		}

		const num = parseInt(projectNumber, 10);
		if (isNaN(num)) {
			return NextResponse.json({ error: 'projectNumber must be a number' }, { status: 400 });
		}

		let projectData;
		try {
			projectData = await fetchProjectV2Data(org, num, auth.accessToken, ownerType);
		} catch {
			// Fallback: try the other owner type
			const fallback = ownerType === 'organization' ? 'user' : 'organization';
			projectData = await fetchProjectV2Data(org, num, auth.accessToken, fallback);
		}
		const viewRepoMappings = mapViewsToRepos(projectData.views, projectData.items);

		return NextResponse.json({
			project: {
				id: projectData.id,
				title: projectData.title,
				number: projectData.number,
			},
			views: projectData.views,
			viewRepoMappings,
			statusColumns: projectData.statusColumns,
		});
	} catch (err) {
		console.error('Projects API error:', err);
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			{ status: 500 },
		);
	}
}
