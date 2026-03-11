import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { createIssueComment } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(request: Request) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { repoFullName, branchName, issueNumber } = await request.json();

		if (!repoFullName || !branchName) {
			return NextResponse.json(
				{ error: 'repoFullName and branchName are required' },
				{ status: 400 },
			);
		}

		// Validate branch name (no spaces, no special chars except - _ / .)
		if (!/^[\w./-]+$/.test(branchName)) {
			return NextResponse.json({ error: 'Invalid branch name' }, { status: 400 });
		}

		// Resolve local path from Supabase
		const { data, error } = await supabase
			.from('repo_paths')
			.select('local_path')
			.eq('repo_full_name', repoFullName)
			.single();

		if (error || !data) {
			return NextResponse.json(
				{ error: `No local path configured for ${repoFullName}. Set it in Settings.` },
				{ status: 404 },
			);
		}

		const cwd = data.local_path;

		// Execute git commands sequentially
		const commands = [
			'git checkout main',
			'git pull --rebase',
			`git checkout -b ${branchName}`,
		];

		for (const cmd of commands) {
			execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000 });
		}

		// Post branch name as comment on the GitHub issue
		if (issueNumber) {
			const [owner, repo] = repoFullName.split('/');
			await createIssueComment(owner, repo, issueNumber, `Branch \`${branchName}\` created`, auth.accessToken);
		}

		return NextResponse.json({ success: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create branch';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
