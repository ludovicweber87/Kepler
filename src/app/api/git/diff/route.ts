import { NextRequest, NextResponse } from 'next/server';
import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

function getBaseBranch(cwd: string): string {
	try {
		const branches = execSync('git branch --list main master', {
			cwd,
			encoding: 'utf-8',
			timeout: 5000,
		}).trim();
		if (branches.includes('master') && !branches.includes('main')) {
			return 'master';
		}
	} catch {
		// fallback
	}
	return 'main';
}

export async function GET(req: NextRequest) {
	const cwd = req.nextUrl.searchParams.get('cwd');
	const branch = req.nextUrl.searchParams.get('branch');

	if (!cwd) {
		return NextResponse.json({ error: 'cwd is required' }, { status: 400 });
	}

	try {
		const baseBranch = getBaseBranch(cwd);
		let diff = '';
		let stats = '';

		const isWorktreeDir = existsSync(cwd);

		if (isWorktreeDir) {
			// Worktree exists — diff working tree against base branch
			// This captures both committed and uncommitted changes
			diff = execFileSync('git', ['diff', baseBranch], {
				cwd,
				encoding: 'utf-8',
				timeout: 15000,
				maxBuffer: 5 * 1024 * 1024,
			});
			stats = execFileSync('git', ['diff', '--stat', baseBranch], {
				cwd,
				encoding: 'utf-8',
				timeout: 5000,
			});
		} else if (branch && branch !== baseBranch) {
			// Worktree deleted — compare branch commits against base
			diff = execSync(`git diff ${baseBranch}..${branch}`, {
				cwd: process.cwd(),
				encoding: 'utf-8',
				timeout: 15000,
				maxBuffer: 5 * 1024 * 1024,
			});
			stats = execSync(`git diff --stat ${baseBranch}..${branch}`, {
				cwd: process.cwd(),
				encoding: 'utf-8',
				timeout: 5000,
			});
		}

		return NextResponse.json({ diff, stats });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to get diff';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
