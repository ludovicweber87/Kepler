import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

/**
 * Extract owner/repo from a local git repository's origin remote.
 * GET /api/git/repo-name?path=/some/local/path
 */
export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const path = req.nextUrl.searchParams.get('path');
	if (!path) {
		return NextResponse.json({ error: 'path parameter required' }, { status: 400 });
	}

	try {
		const remoteUrl = execSync('git remote get-url origin', {
			cwd: path,
			encoding: 'utf-8',
			timeout: 5000,
		}).trim();

		// Parse owner/repo from various remote URL formats:
		// https://github.com/owner/repo.git
		// git@github.com:owner/repo.git
		const match = remoteUrl.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
		if (!match) {
			return NextResponse.json({ error: 'Could not parse GitHub remote URL' }, { status: 400 });
		}

		return NextResponse.json({ repoFullName: match[1] });
	} catch {
		return NextResponse.json({ error: 'Not a git repository or no origin remote' }, { status: 400 });
	}
}
