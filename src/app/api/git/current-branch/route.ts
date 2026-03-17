import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

/**
 * Get the current git branch for a local repository.
 * GET /api/git/current-branch?path=/some/local/path
 */
export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const path = req.nextUrl.searchParams.get('path');
	if (!path) {
		return NextResponse.json({ error: 'path parameter required' }, { status: 400 });
	}

	try {
		const branch = execSync('git branch --show-current', {
			cwd: path,
			encoding: 'utf-8',
			timeout: 5000,
		}).trim();

		return NextResponse.json({ branch: branch || 'HEAD' });
	} catch {
		return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
	}
}
