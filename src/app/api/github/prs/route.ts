import { NextRequest, NextResponse } from 'next/server';
import { fetchRepoPullRequests } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const repos = req.nextUrl.searchParams.get('repos');
		if (!repos) {
			return NextResponse.json({ error: 'repos parameter required' }, { status: 400 });
		}

		const allRepos = repos.split(',').map((r) => r.trim());
		const repoList = allRepos.filter((r) => r.includes('/'));
		const skipped = allRepos.filter((r) => r && !r.includes('/'));
		if (skipped.length > 0) {
			console.warn('[PRs] Skipping repos without owner prefix:', skipped);
		}
		console.log('[PRs] userId:', auth.userId, 'repos param:', repos, '→ repoList:', repoList);
		const results = await Promise.allSettled(
			repoList.map((repo) => {
				const [owner, name] = repo.split('/');
				return fetchRepoPullRequests(owner, name, 'open', auth.accessToken);
			}),
		);

		const prs = results
			.filter(
				(
					r,
				): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchRepoPullRequests>>> =>
					r.status === 'fulfilled',
			)
			.flatMap((r) => r.value);

		prs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

		return NextResponse.json({ prs });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
