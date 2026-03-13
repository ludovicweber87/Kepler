import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export interface WorktreeInfo {
	path: string;
	branch: string;
	head: string;
}

function parseWorktreeList(output: string): WorktreeInfo[] {
	const worktrees: WorktreeInfo[] = [];
	let current: Partial<WorktreeInfo> = {};

	for (const line of output.split('\n')) {
		if (line.startsWith('worktree ')) {
			current.path = line.slice('worktree '.length);
		} else if (line.startsWith('HEAD ')) {
			current.head = line.slice('HEAD '.length);
		} else if (line.startsWith('branch ')) {
			// refs/heads/feat/42-fix -> feat/42-fix
			current.branch = line.slice('branch '.length).replace('refs/heads/', '');
		} else if (line === '') {
			if (current.path && current.branch && current.head) {
				worktrees.push(current as WorktreeInfo);
			}
			current = {};
		}
	}

	// Handle last entry if no trailing newline
	if (current.path && current.branch && current.head) {
		worktrees.push(current as WorktreeInfo);
	}

	return worktrees;
}

/**
 * GET /api/git/worktrees?cwd={repoPath}
 * Lists all worktrees for a repo, excluding the main worktree.
 */
export async function GET(request: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const cwd = request.nextUrl.searchParams.get('cwd');
	if (!cwd) {
		return NextResponse.json({ error: 'cwd is required' }, { status: 400 });
	}

	try {
		const output = execSync('git worktree list --porcelain', {
			cwd,
			encoding: 'utf-8',
			timeout: 10000,
		});

		const all = parseWorktreeList(output);

		// Filter out the main worktree (the one at cwd itself)
		const worktrees = all.filter((wt) => wt.path !== cwd);

		return NextResponse.json({ worktrees });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to list worktrees';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * POST /api/git/worktrees
 * Creates a new worktree with a new branch under .worktrees/<branch>.
 */
export async function POST(request: Request) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { cwd, branch } = await request.json();

		if (!cwd || !branch) {
			return NextResponse.json(
				{ error: 'cwd and branch are required' },
				{ status: 400 },
			);
		}

		// Sanitize branch name for directory (replace / with -)
		const dirName = branch.replace(/\//g, '-');
		const worktreePath = `${cwd}/.worktrees/${dirName}`;

		// Create the worktree with a new branch based on main
		// First, try to get the default branch
		let baseBranch = 'main';
		try {
			const head = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
				cwd,
				encoding: 'utf-8',
				timeout: 5000,
			}).trim();
			baseBranch = head.replace('refs/remotes/origin/', '');
		} catch {
			// Fallback to main
		}

		// Pull latest from base branch
		try {
			execSync(`git fetch origin ${baseBranch}`, {
				cwd,
				encoding: 'utf-8',
				timeout: 30000,
			});
		} catch {
			// May fail if offline — continue anyway
		}

		// Create worktree with new branch from origin/<baseBranch>
		execSync(
			`git worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify(branch)} origin/${baseBranch}`,
			{
				cwd,
				encoding: 'utf-8',
				timeout: 30000,
			},
		);

		return NextResponse.json({ worktreePath, branch });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create worktree';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * DELETE /api/git/worktrees
 * Removes a worktree and optionally its local branch.
 */
export async function DELETE(request: Request) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { cwd, worktreePath, deleteBranch = false } = await request.json();

		if (!cwd || !worktreePath) {
			return NextResponse.json(
				{ error: 'cwd and worktreePath are required' },
				{ status: 400 },
			);
		}

		// Get the branch name before removing
		const listOutput = execSync('git worktree list --porcelain', {
			cwd,
			encoding: 'utf-8',
			timeout: 10000,
		});
		const worktrees = parseWorktreeList(listOutput);
		const target = worktrees.find((wt) => wt.path === worktreePath);

		// Remove the worktree
		execSync(`git worktree remove ${JSON.stringify(worktreePath)} --force`, {
			cwd,
			encoding: 'utf-8',
			timeout: 30000,
		});

		// Delete the local branch only if explicitly requested
		if (deleteBranch && target?.branch) {
			try {
				execSync(`git branch -D ${JSON.stringify(target.branch)}`, {
					cwd,
					encoding: 'utf-8',
					timeout: 10000,
				});
			} catch {
				// Branch may not exist locally — skip
			}
		}

		return NextResponse.json({ success: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to remove worktree';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
