import { IncomingMessage, ServerResponse } from 'node:http';
import { execSync, execFileSync } from 'node:child_process';
import { readdirSync, copyFileSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
	parseQuery,
	readBody,
	sendJson,
	sendError,
	getToken,
	findClaude,
	findTmux,
} from '../helpers.js';
import { getDb } from '../db.js';

const TMUX = findTmux();

// ── Types ──

export interface WorktreeInfo {
	path: string;
	branch: string;
	head: string;
}

// ── Helpers ──

function parseWorktreeList(output: string): WorktreeInfo[] {
	const worktrees: WorktreeInfo[] = [];
	let current: Partial<WorktreeInfo> = {};

	for (const line of output.split('\n')) {
		if (line.startsWith('worktree ')) {
			current.path = line.slice('worktree '.length);
		} else if (line.startsWith('HEAD ')) {
			current.head = line.slice('HEAD '.length);
		} else if (line.startsWith('branch ')) {
			current.branch = line.slice('branch '.length).replace('refs/heads/', '');
		} else if (line === '') {
			if (current.path && current.branch && current.head) {
				worktrees.push(current as WorktreeInfo);
			}
			current = {};
		}
	}
	if (current.path && current.branch && current.head) {
		worktrees.push(current as WorktreeInfo);
	}
	return worktrees;
}

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


async function postGitHubComment(
	token: string,
	owner: string,
	repo: string,
	issueNumber: number,
	body: string,
) {
	await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		},
		body: JSON.stringify({ body }),
	});
}

// ── Router ──

export async function handleGitRoutes(req: IncomingMessage, res: ServerResponse, path: string) {
	const method = req.method ?? 'GET';
	const query = parseQuery(req);

	// GET /git/worktrees
	if (path === '/git/worktrees' && method === 'GET') {
		const cwd = query.get('cwd');
		if (!cwd) return sendJson(res, { error: 'cwd is required' }, 400);

		try {
			const output = execSync('git worktree list --porcelain', {
				cwd,
				encoding: 'utf-8',
				timeout: 10000,
			});
			const all = parseWorktreeList(output);
			const worktrees = all.filter((wt) => wt.path !== cwd);
			sendJson(res, { worktrees });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Failed to list worktrees');
		}
		return;
	}

	// POST /git/worktrees
	if (path === '/git/worktrees' && method === 'POST') {
		try {
			const { cwd, branch } = await readBody<{ cwd: string; branch: string }>(req);
			if (!cwd || !branch) return sendJson(res, { error: 'cwd and branch are required' }, 400);

			const dirName = branch.replace(/\//g, '-');
			const worktreePath = `${cwd}/.worktrees/${dirName}`;

			let baseBranch = 'main';
			try {
				const head = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
					cwd,
					encoding: 'utf-8',
					timeout: 5000,
				}).trim();
				baseBranch = head.replace('refs/remotes/origin/', '');
			} catch {
				// fallback
			}

			try {
				execSync(`git fetch origin ${baseBranch}`, { cwd, encoding: 'utf-8', timeout: 30000 });
			} catch {
				// May fail if offline
			}

			execSync(
				`git worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify(branch)} origin/${baseBranch}`,
				{ cwd, encoding: 'utf-8', timeout: 30000 },
			);

			// Copy .env* files
			try {
				const envFiles = readdirSync(cwd).filter((f) => f.startsWith('.env'));
				for (const file of envFiles) {
					copyFileSync(join(cwd, file), join(worktreePath, file));
				}
			} catch {
				// non-blocking
			}

			// Symlink node_modules
			try {
				const srcModules = join(cwd, 'node_modules');
				const destModules = join(worktreePath, 'node_modules');
				if (existsSync(srcModules) && !existsSync(destModules)) {
					symlinkSync(srcModules, destModules, 'dir');
				}
			} catch {
				// non-blocking
			}

			sendJson(res, { worktreePath, branch });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Failed to create worktree');
		}
		return;
	}

	// DELETE /git/worktrees
	if (path === '/git/worktrees' && method === 'DELETE') {
		try {
			const { cwd, worktreePath, deleteBranch = false } = await readBody<{
				cwd: string;
				worktreePath: string;
				deleteBranch?: boolean;
			}>(req);
			if (!cwd || !worktreePath)
				return sendJson(res, { error: 'cwd and worktreePath are required' }, 400);

			const listOutput = execSync('git worktree list --porcelain', {
				cwd,
				encoding: 'utf-8',
				timeout: 10000,
			});
			const worktrees = parseWorktreeList(listOutput);
			const target = worktrees.find((wt) => wt.path === worktreePath);

			execSync(`git worktree remove ${JSON.stringify(worktreePath)} --force`, {
				cwd,
				encoding: 'utf-8',
				timeout: 30000,
			});

			if (deleteBranch && target?.branch) {
				try {
					execSync(`git branch -D ${JSON.stringify(target.branch)}`, {
						cwd,
						encoding: 'utf-8',
						timeout: 10000,
					});
				} catch {
					// branch may not exist
				}
			}

			// Clean up any agent sessions bound to this worktree: kill their tmux
			// sessions and purge their DB records + logs. Failures here must not
			// fail the worktree removal itself.
			try {
				const db = getDb();
				if (db) {
					const rows = db
						.prepare('SELECT id, session_id FROM agent_sessions WHERE worktree_path = ?')
						.all(worktreePath) as { id: string; session_id: string }[];
					for (const s of rows) {
						try {
							execSync(`${TMUX} kill-session -t ${s.session_id}-shell`, { stdio: 'ignore' });
						} catch {
							// shell may not exist
						}
						try {
							execSync(`${TMUX} kill-session -t ${s.session_id}`, { stdio: 'ignore' });
						} catch {
							// session may be dead
						}
						db.prepare('DELETE FROM agent_activity_logs WHERE agent_session_id = ?').run(s.id);
					}
					db.prepare('DELETE FROM agent_sessions WHERE worktree_path = ?').run(worktreePath);
				}
			} catch {
				// session cleanup is best-effort
			}

			sendJson(res, { success: true });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Failed to remove worktree');
		}
		return;
	}

	// GET /git/branches
	if (path === '/git/branches' && method === 'GET') {
		const localPath = query.get('path');
		if (!localPath) return sendJson(res, { error: 'path required' }, 400);

		try {
			const raw = execSync(
				`git -C ${JSON.stringify(localPath)} branch --format='%(refname:short)|%(committerdate:iso8601)|%(subject)|%(authorname)' --sort=-committerdate`,
				{ encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] },
			);

			let current = '';
			try {
				current = execSync(`git -C ${JSON.stringify(localPath)} rev-parse --abbrev-ref HEAD`, {
					encoding: 'utf-8',
					timeout: 5_000,
					stdio: ['pipe', 'pipe', 'ignore'],
				}).trim();
			} catch {
				// ignore
			}

			const branches = raw
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((line) => {
					const [name, date, message, author] = line.split('|');
					return {
						name: name.trim(),
						lastCommitDate: date?.trim() ?? '',
						lastCommitMessage: message?.trim() ?? '',
						lastCommitAuthor: author?.trim() ?? '',
						isCurrent: name.trim() === current,
					};
				});

			sendJson(res, { branches });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}

	// GET /git/branches/log
	if (path === '/git/branches/log' && method === 'GET') {
		const localPath = query.get('path');
		const branch = query.get('branch');
		if (!localPath || !branch) return sendJson(res, { error: 'path and branch required' }, 400);

		try {
			const raw = execSync(
				`git -C ${JSON.stringify(localPath)} log ${JSON.stringify(branch)} --format='%H|%h|%s|%an|%ai' -n 30`,
				{ encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] },
			);

			const commits = raw
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((line) => {
					const [hash, shortHash, message, author, date] = line.split('|');
					return {
						hash: hash?.trim() ?? '',
						shortHash: shortHash?.trim() ?? '',
						message: message?.trim() ?? '',
						author: author?.trim() ?? '',
						date: date?.trim() ?? '',
					};
				});

			sendJson(res, { commits });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}

	// POST /git/branch (create branch + worktree from issue)
	if (path === '/git/branch' && method === 'POST') {
		const token = getToken(req);

		try {
			const { repoFullName, branchName, issueNumber } = await readBody<{
				repoFullName: string;
				branchName: string;
				issueNumber?: number;
			}>(req);

			if (!repoFullName || !branchName)
				return sendJson(res, { error: 'repoFullName and branchName are required' }, 400);

			if (!/^[\w./-]+$/.test(branchName))
				return sendJson(res, { error: 'Invalid branch name' }, 400);

			// Resolve local path from the SQLite DB
			const db = getDb();
			if (!db) return sendError(res, 'Database not available', 500);

			const row = db
				.prepare('SELECT local_path FROM repo_paths WHERE repo_full_name = ?')
				.get(repoFullName) as { local_path: string } | undefined;

			if (!row)
				return sendJson(
					res,
					{ error: `No local path configured for ${repoFullName}. Set it in Settings.` },
					404,
				);

			const cwd = row.local_path;
			const slug = branchName.replace(/\//g, '-');
			const worktreePath = `${cwd}/.worktrees/${slug}`;

			execSync('mkdir -p .worktrees', { cwd, encoding: 'utf-8', timeout: 10000 });

			const commands = [
				'git fetch origin main',
				`git worktree add ${JSON.stringify(worktreePath)} -b ${branchName} origin/main`,
			];
			for (const cmd of commands) {
				execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000 });
			}

			// Post comment on GitHub issue
			if (issueNumber && token) {
				const [owner, repo] = repoFullName.split('/');
				await postGitHubComment(
					token,
					owner,
					repo,
					issueNumber,
					`Branch \`${branchName}\` created (worktree)`,
				);
			}

			sendJson(res, { success: true, worktreePath });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Failed to create branch');
		}
		return;
	}

	// GET /git/current-branch
	if (path === '/git/current-branch' && method === 'GET') {
		const localPath = query.get('path');
		if (!localPath) return sendJson(res, { error: 'path parameter required' }, 400);

		try {
			const branch = execSync('git branch --show-current', {
				cwd: localPath,
				encoding: 'utf-8',
				timeout: 5000,
			}).trim();
			sendJson(res, { branch: branch || 'HEAD' });
		} catch {
			sendJson(res, { error: 'Not a git repository' }, 400);
		}
		return;
	}

	// GET /git/diff
	if (path === '/git/diff' && method === 'GET') {
		const cwd = query.get('cwd');
		const branch = query.get('branch');
		if (!cwd) return sendJson(res, { error: 'cwd is required' }, 400);

		try {
			const baseBranch = getBaseBranch(cwd);
			let diff = '';
			let stats = '';

			const isWorktreeDir = existsSync(cwd);

			if (isWorktreeDir) {
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

			sendJson(res, { diff, stats });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Failed to get diff');
		}
		return;
	}

	// POST /git/push
	if (path === '/git/push' && method === 'POST') {
		try {
			const { cwd, branch } = await readBody<{ cwd: string; branch: string }>(req);
			if (!cwd || !branch) return sendJson(res, { error: 'cwd and branch required' }, 400);

			const output = execSync(`git push -u origin ${branch}`, {
				cwd,
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'pipe'],
				timeout: 30_000,
			});
			sendJson(res, { ok: true, output });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}

	// GET /git/repo-name
	if (path === '/git/repo-name' && method === 'GET') {
		const localPath = query.get('path');
		if (!localPath) return sendJson(res, { error: 'path parameter required' }, 400);

		try {
			const remoteUrl = execSync('git remote get-url origin', {
				cwd: localPath,
				encoding: 'utf-8',
				timeout: 5000,
			}).trim();

			const match = remoteUrl.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
			if (!match) return sendJson(res, { error: 'Could not parse GitHub remote URL' }, 400);

			sendJson(res, { repoFullName: match[1] });
		} catch {
			sendJson(res, { error: 'Not a git repository or no origin remote' }, 400);
		}
		return;
	}

	// POST /git/generate-branch-name
	if (path === '/git/generate-branch-name' && method === 'POST') {
		try {
			const { issueTitle, issueNumber, labels } = await readBody<{
				issueTitle: string;
				issueNumber: number;
				labels?: string[];
			}>(req);

			if (!issueTitle || !issueNumber)
				return sendJson(res, { error: 'issueTitle and issueNumber required' }, 400);

			const lowerLabels = (labels ?? []).map((l) => l.toLowerCase());
			let prefix = 'feat';
			if (lowerLabels.some((l) => l.includes('bug') || l.includes('fix'))) prefix = 'fix';
			else if (lowerLabels.some((l) => l.includes('refactor'))) prefix = 'refactor';
			else if (lowerLabels.some((l) => l.includes('docs') || l.includes('documentation')))
				prefix = 'docs';
			else if (lowerLabels.some((l) => l.includes('chore'))) prefix = 'chore';
			else if (lowerLabels.some((l) => l.includes('test'))) prefix = 'test';
			else if (lowerLabels.some((l) => l.includes('perf') || l.includes('performance')))
				prefix = 'perf';

			const CLAUDE_BIN = findClaude();
			const prompt = `Generate a short git branch slug in English from this GitHub issue title. Rules:
- Output ONLY the slug, nothing else
- 2-5 words separated by hyphens
- Lowercase, no special characters
- Must be meaningful and summarize the issue
- Translate to English if needed

Issue title: "${issueTitle}"`;

			const escaped = prompt.replace(/'/g, "'\\''");
			const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env as Record<
				string,
				string | undefined
			>;

			const slug = execSync(`${CLAUDE_BIN} --print '${escaped}'`, {
				encoding: 'utf-8',
				timeout: 15_000,
				maxBuffer: 1024 * 512,
				env: cleanEnv as NodeJS.ProcessEnv,
			})
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9-]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 40);

			if (!slug) return sendError(res, 'Empty slug generated');

			const branchName = `${prefix}/${issueNumber}-${slug}`;
			sendJson(res, { branchName, prefix, slug });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}

	sendJson(res, { error: 'Not found' }, 404);
}
