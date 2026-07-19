import { NextRequest, NextResponse } from 'next/server';
import { fetchRepoLabels, fetchRepoMilestones, fetchRepoAssignees } from '@/lib/github';
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
		const [labels, milestones, assignees] = await Promise.all([
			fetchRepoLabels(owner, name, auth.accessToken),
			fetchRepoMilestones(owner, name, auth.accessToken),
			fetchRepoAssignees(owner, name, auth.accessToken),
		]);
		return NextResponse.json({ labels, milestones, assignees });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
