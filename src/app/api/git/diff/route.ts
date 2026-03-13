import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
	const cwd = req.nextUrl.searchParams.get('cwd');
	const branch = req.nextUrl.searchParams.get('branch');

	if (!cwd) {
		return NextResponse.json({ error: 'cwd is required' }, { status: 400 });
	}

	try {
		// Detect default branch (main or master)
		let baseBranch = 'main';
		try {
			const branches = execSync('git branch --list main master', {
				cwd,
				encoding: 'utf-8',
				timeout: 5000,
			}).trim();
			if (branches.includes('master') && !branches.includes('main')) {
				baseBranch = 'master';
			}
		} catch {
			// fallback to main
		}

		let diff = '';
		let stats = '';

			if (branch && branch !== baseBranch) {
			// Compare branch commits against base branch
			// Using explicit branch range so it works even when cwd is not the worktree
			// (e.g. past sessions whose worktree was deleted)
			try {
				diff = execSync(`git diff ${baseBranch}..${branch}`, {
					cwd,
					encoding: 'utf-8',
					timeout: 15000,
					maxBuffer: 5 * 1024 * 1024,
				});
				stats = execSync(`git diff --stat ${baseBranch}..${branch}`, {
					cwd,
					encoding: 'utf-8',
					timeout: 5000,
				});
			} catch {
				// Fallback: diff against working tree (worktree still active)
				diff = execSync(`git diff ${baseBranch}`, {
					cwd,
					encoding: 'utf-8',
					timeout: 15000,
					maxBuffer: 5 * 1024 * 1024,
				});
				stats = execSync(`git diff --stat ${baseBranch}`, {
					cwd,
					encoding: 'utf-8',
					timeout: 5000,
				});
			}
		} else {
			// No branch specified — show uncommitted changes (staged + unstaged)
			diff = execSync('git diff HEAD', {
				cwd,
				encoding: 'utf-8',
				timeout: 15000,
				maxBuffer: 5 * 1024 * 1024,
			});
			stats = execSync('git diff --stat HEAD', {
				cwd,
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
