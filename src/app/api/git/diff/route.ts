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
			// Find the merge-base so we only show changes made IN the worktree,
			// not changes that happened on the base branch after divergence
			const mergeBase = execFileSync('git', ['merge-base', baseBranch, 'HEAD'], {
				cwd,
				encoding: 'utf-8',
				timeout: 5000,
			}).trim();

			diff = execFileSync('git', ['diff', mergeBase], {
				cwd,
				encoding: 'utf-8',
				timeout: 15000,
				maxBuffer: 5 * 1024 * 1024,
			});
			stats = execFileSync('git', ['diff', '--stat', mergeBase], {
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
