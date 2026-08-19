import { IncomingMessage, ServerResponse } from 'node:http';
import { execSync, execFileSync, exec, execFile, spawn } from 'node:child_process';
import { parsePorcelain } from './parsePorcelain.js';
import { promisify } from 'node:util';
import { readdirSync, copyFileSync, existsSync, symlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
	parseQuery,
	readBody,
	sendJson,
	sendError,
	resolveGitHubToken,
	findClaude,
	cleanClaudeEnv,
	findTmux,
	startSSE,
	sendSSE,
} from '../helpers.js';
import { getDb } from '../db.js';
import { sdkAgent } from '../terminal.js';
import { slugifyBranchInput, moveWorktreeDir } from '../sdk/autoRename.js';
import { fetchIssueContextBlock, issueContextMarker } from '../issueContext.js';
import { parseFilesToCopy } from '../filesToCopy.js';
import { resolveCopyTargets } from '../resolveCopyTargets.js';
import { resolveRemoteBaseRef, resolveDiffBase } from '../gitBase.js';
import { untrackedDiff, DIFF_MAX_BUFFER } from '../untrackedDiff.js';
import { dedupeAndSortBranches, worktreeAddArgs, type RawBranch } from '../branches.js';

const TMUX = findTmux();
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Récupère la liste `files_to_copy` configurée pour le repo dont le chemin local est `cwd`.
 * Dégrade proprement (chaîne vide) si la DB est absente ou le repo non configuré.
 */
function getFilesToCopyForCwd(cwd: string): string {
	try {
		const db = getDb();
		if (!db) return '';
		const row = db
			.prepare(
				`SELECT s.files_to_copy AS files
				 FROM repo_settings s
				 JOIN repo_paths p ON p.repo_full_name = s.repo_full_name
				 WHERE p.local_path = ?`,
			)
			.get(cwd) as { files: string } | undefined;
		return row?.files ?? '';
	} catch {
		return '';
	}
}

/**
 * Copie dans `worktreePath` les fichiers configurés (`files_to_copy`), en les retrouvant
 * récursivement depuis `sourceCwd` et en les recopiant au même chemin relatif.
 * Fallback : si aucune config, copie les `.env*` de la racine (comportement historique).
 * Non bloquant : les erreurs individuelles sont ignorées.
 */
function copyConfiguredFiles(
	sourceCwd: string,
	worktreePath: string,
	filesToCopyText: string,
): void {
	try {
		const parsed = parseFilesToCopy(filesToCopyText);
		const rels =
			parsed.length > 0
				? resolveCopyTargets(sourceCwd, parsed)
				: readdirSync(sourceCwd).filter((f) => f.startsWith('.env'));
		for (const rel of rels) {
			const src = join(sourceCwd, rel);
			if (!existsSync(src)) continue;
			const dest = join(worktreePath, rel);
			mkdirSync(dirname(dest), { recursive: true });
			copyFileSync(src, dest);
		}
	} catch {
		/* non bloquant */
	}
}

function localBranchExists(cwd: string, branch: string): boolean {
	try {
		execFileSync(
			'git',
			['-C', cwd, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
			{
				timeout: 5000,
				stdio: 'ignore',
			},
		);
		return true;
	} catch {
		return false;
	}
}

function remoteBranchExists(cwd: string, branch: string): boolean {
	try {
		execFileSync(
			'git',
			['-C', cwd, 'show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`],
			{ timeout: 5000, stdio: 'ignore' },
		);
		return true;
	} catch {
		return false;
	}
}

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
			if (!cwd || !branch)
				return sendJson(res, { error: 'cwd and branch are required' }, 400);

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
				execSync(`git fetch origin ${baseBranch}`, {
					cwd,
					encoding: 'utf-8',
					timeout: 30000,
				});
			} catch {
				// May fail if offline
			}

			execSync(
				`git worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify(branch)} origin/${baseBranch}`,
				{ cwd, encoding: 'utf-8', timeout: 30000 },
			);

			// Copy configured files (files_to_copy), recursively resolved
			copyConfiguredFiles(cwd, worktreePath, getFilesToCopyForCwd(cwd));

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
			const {
				cwd,
				worktreePath,
				deleteBranch = false,
			} = await readBody<{
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
						.prepare(
							'SELECT id, session_id FROM agent_sessions WHERE worktree_path = ?',
						)
						.all(worktreePath) as { id: string; session_id: string }[];
					for (const s of rows) {
						try {
							execSync(`${TMUX} kill-session -t ${s.session_id}-shell`, {
								stdio: 'ignore',
							});
						} catch {
							// shell may not exist
						}
						try {
							execSync(`${TMUX} kill-session -t ${s.session_id}`, {
								stdio: 'ignore',
							});
						} catch {
							// session may be dead
						}
						db.prepare(
							'DELETE FROM agent_activity_logs WHERE agent_session_id = ?',
						).run(s.id);
					}
					db.prepare('DELETE FROM agent_sessions WHERE worktree_path = ?').run(
						worktreePath,
					);
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

	// POST /git/rename-worktree — renomme branche + dossier worktree (identité worktree).
	// N'affecte PAS agent_name (nom de persona) : les deux sont découplés.
	// Seul chemin d'édition manuel (clic droit → renommer). Si une session SDK vit
	// sur ce worktree, le move du dossier passe par le manager (différé si busy).
	if (path === '/git/rename-worktree' && method === 'POST') {
		try {
			const { worktreePath, newName, sessionId } = await readBody<{
				worktreePath: string;
				newName: string;
				sessionId?: string;
			}>(req);
			if (!worktreePath || !newName?.trim())
				return sendJson(res, { error: 'worktreePath and newName are required' }, 400);

			const slug = slugifyBranchInput(newName);
			if (!slug) return sendJson(res, { error: `Invalid branch name: ${newName}` }, 400);

			const oldBranch = execFileSync('git', ['-C', worktreePath, 'branch', '--show-current'], {
				encoding: 'utf-8',
				timeout: 10000,
			}).trim();

			if (slug !== oldBranch) {
				// Validate the new ref name against git's own rules.
				try {
					execFileSync('git', ['check-ref-format', '--branch', slug], {
						cwd: worktreePath,
						stdio: 'ignore',
						timeout: 10000,
					});
				} catch {
					return sendJson(res, { error: `Invalid branch name: ${slug}` }, 400);
				}

				if (localBranchExists(worktreePath, slug))
					return sendJson(res, { error: `Branch already exists: ${slug}` }, 409);

				execFileSync('git', ['-C', worktreePath, 'branch', '-m', oldBranch, slug], {
					encoding: 'utf-8',
					timeout: 10000,
				});
			}

			const db = getDb();
			try {
				// Renommage worktree = identité worktree uniquement (branch + worktree_path).
				// On NE touche PAS agent_name : c'est le nom de persona (label au-dessus du
				// composer), une donnée séparée qui ne doit pas bouger avec le worktree.
				db?.prepare('UPDATE agent_sessions SET branch = ? WHERE worktree_path = ?').run(
					slug,
					worktreePath,
				);
			} catch {
				/* best-effort */
			}

			// Move du dossier : via le manager SDK si la session vit (restart propre),
			// sinon directement — aucun process à ménager.
			let finalPath: string = worktreePath;
			let deferred = false;
			if (sessionId && sdkAgent.has(sessionId)) {
				const move = await sdkAgent.requestWorktreeMove(sessionId, slug);
				if (move.status === 'moved' && move.worktreePath) finalPath = move.worktreePath;
				else deferred = true;
			} else {
				const moved = moveWorktreeDir(worktreePath, slug);
				if (moved) {
					finalPath = moved;
					try {
						db?.prepare(
							'UPDATE agent_sessions SET worktree_path = ? WHERE worktree_path = ?',
						).run(moved, worktreePath);
					} catch {
						/* best-effort */
					}
				}
			}

			sendJson(res, { branch: slug, worktreePath: finalPath, deferred });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Failed to rename worktree');
		}
		return;
	}

	// GET /git/branches
	if (path === '/git/branches' && method === 'GET') {
		const localPath = query.get('path');
		if (!localPath) return sendJson(res, { error: 'path required' }, 400);
		const includeRemote = query.get('includeRemote') === 'true';

		const parseRefs = (raw: string): RawBranch[] =>
			raw
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
					};
				});

		try {
			const localRaw = execSync(
				`git -C ${JSON.stringify(localPath)} branch --format='%(refname:short)|%(committerdate:iso8601)|%(subject)|%(authorname)' --sort=-committerdate`,
				{ encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] },
			);
			const local = parseRefs(localRaw);

			let current = '';
			try {
				current = execSync(
					`git -C ${JSON.stringify(localPath)} rev-parse --abbrev-ref HEAD`,
					{
						encoding: 'utf-8',
						timeout: 5_000,
						stdio: ['pipe', 'pipe', 'ignore'],
					},
				).trim();
			} catch {
				// ignore
			}

			let remote: RawBranch[] = [];
			let checkedOut: string[] = [];
			if (includeRemote) {
				try {
					const remoteRaw = execSync(
						`git -C ${JSON.stringify(localPath)} for-each-ref --sort=-committerdate --format='%(refname:short)|%(committerdate:iso8601)|%(subject)|%(authorname)' refs/remotes/origin`,
						{ encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] },
					);
					remote = parseRefs(remoteRaw)
						.map((b) => ({ ...b, name: b.name.replace(/^origin\//, '') }))
						.filter((b) => b.name && b.name !== 'HEAD');
				} catch {
					// pas de remote / offline
				}
				try {
					const wtRaw = execSync(
						`git -C ${JSON.stringify(localPath)} worktree list --porcelain`,
						{
							encoding: 'utf-8',
							timeout: 10_000,
							stdio: ['pipe', 'pipe', 'ignore'],
						},
					);
					checkedOut = wtRaw
						.split('\n')
						.filter((l) => l.startsWith('branch refs/heads/'))
						.map((l) => l.replace('branch refs/heads/', '').trim());
				} catch {
					// ignore
				}
			}

			const branches = dedupeAndSortBranches({ local, remote, current, checkedOut });
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
		const token = resolveGitHubToken(req);

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
			const baseRef = resolveRemoteBaseRef(cwd);
			let diff = '';
			let stats = '';

			const isWorktreeDir = existsSync(cwd);

			if (isWorktreeDir) {
				const diffBase = resolveDiffBase(cwd, baseRef);

				// Les fichiers non trackés sont invisibles pour `git diff <ref>` : on les
				// diffe séparément et on concatène, le parser côté front ne voit qu'un diff.
				diff =
					execFileSync('git', ['diff', diffBase], {
						cwd,
						encoding: 'utf-8',
						timeout: 15000,
						maxBuffer: DIFF_MAX_BUFFER,
					}) + untrackedDiff(cwd);
				stats = execFileSync('git', ['diff', '--stat', diffBase], {
					cwd,
					encoding: 'utf-8',
					timeout: 5000,
					maxBuffer: DIFF_MAX_BUFFER,
				});
			} else if (baseRef && branch) {
				// Diff hors répertoire worktree : compare la base distante à la branche.
				// Note : si `branch` vaut le nom court de la base (ex. 'main'), le diff
				// `origin/main..main` est vide/correct — comportement inoffensif attendu.
				diff = execSync(`git diff ${baseRef}..${branch}`, {
					cwd: process.cwd(),
					encoding: 'utf-8',
					timeout: 15000,
					maxBuffer: DIFF_MAX_BUFFER,
				});
				stats = execSync(`git diff --stat ${baseRef}..${branch}`, {
					cwd: process.cwd(),
					encoding: 'utf-8',
					timeout: 5000,
					maxBuffer: DIFF_MAX_BUFFER,
				});
			}

			sendJson(res, { diff, stats });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Failed to get diff');
		}
		return;
	}

	// GET /git/status — présence de changements non commités dans le worktree
	if (path === '/git/status' && method === 'GET') {
		const cwd = query.get('cwd');
		if (!cwd) return sendJson(res, { error: 'cwd is required' }, 400);
		if (!existsSync(cwd)) return sendJson(res, { dirty: false, count: 0 });

		try {
			const out = execFileSync('git', ['status', '--porcelain'], {
				cwd,
				encoding: 'utf-8',
				timeout: 5000,
				maxBuffer: 5 * 1024 * 1024,
			});
			sendJson(res, parsePorcelain(out));
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Failed to get status');
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
			const slug = execSync(`${CLAUDE_BIN} --print '${escaped}'`, {
				encoding: 'utf-8',
				timeout: 15_000,
				maxBuffer: 1024 * 512,
				env: cleanClaudeEnv(),
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

	// POST /git/provision (SSE) — provisionne un worktree étape par étape
	if (path === '/git/provision' && method === 'POST') {
		const body = await readBody<{
			cwd: string;
			branch: string;
			sessionId: string;
			mode: 'worktree' | 'current-branch' | 'existing-branch';
			issue?: { owner: string; repo: string; number: number };
			filesToCopy: string;
			setupScript: string;
		}>(req);
		const token = resolveGitHubToken(req);
		startSSE(res);
		const db = getDb();

		const fail = (step: string, message: string) => {
			try {
				db?.prepare('UPDATE agent_sessions SET status = ? WHERE session_id = ?').run(
					'error',
					body.sessionId,
				);
			} catch {
				/* best-effort */
			}
			sendSSE(res, 'step', { step, status: 'error', message });
			res.end();
		};

		try {
			// 1) read-issue (optionnel)
			if (body.issue) {
				sendSSE(res, 'step', { step: 'read-issue', status: 'running' });
				try {
					// Sans token (gh non authentifié) : on n'injecte rien mais on émet
					// quand même running→done pour ne pas bloquer la step côté UI.
					if (token) {
						const { owner, repo, number } = body.issue;
						const issueBlock = await fetchIssueContextBlock(owner, repo, number, token);
						if (issueBlock && db) {
							// Idempotence : ne pas ré-injecter si un provision précédent
							// (ex. retry) a déjà ajouté le contexte de cette issue.
							const marker = issueContextMarker(number);
							const row = db
								.prepare(
									'SELECT system_prompt FROM agent_sessions WHERE session_id = ?',
								)
								.get(body.sessionId) as { system_prompt?: string } | undefined;
							if (!(row?.system_prompt ?? '').includes(marker)) {
								const nextPrompt =
									`${row?.system_prompt ?? ''}\n\n${issueBlock}`.trim();
								db.prepare(
									'UPDATE agent_sessions SET system_prompt = ? WHERE session_id = ?',
								).run(nextPrompt, body.sessionId);
							}
						}
					}
					sendSSE(res, 'step', { step: 'read-issue', status: 'done' });
				} catch {
					// non bloquant : on saute proprement
					sendSSE(res, 'step', {
						step: 'read-issue',
						status: 'done',
						message: 'skipped',
					});
				}
			}

			let worktreePath = body.cwd;
			let finalBranch = body.branch;

			const producesWorktree = body.mode === 'worktree' || body.mode === 'existing-branch';

			if (producesWorktree) {
				// Nom déterministe (issue) → on garantit l'unicité pour un NOUVEAU worktree.
				// (mode existing-branch = on attache une branche existante, pas de dédup.)
				if (body.mode === 'worktree') {
					let candidate = body.branch;
					let n = 2;
					while (
						localBranchExists(body.cwd, candidate) ||
						existsSync(`${body.cwd}/.worktrees/${candidate.replace(/\//g, '-')}`)
					) {
						candidate = `${body.branch}-${n}`;
						n += 1;
					}
					finalBranch = candidate;
				}

				// 2) worktree
				sendSSE(res, 'step', { step: 'worktree', status: 'running' });
				const dirName = finalBranch.replace(/\//g, '-');
				worktreePath = `${body.cwd}/.worktrees/${dirName}`;
				if (!existsSync(worktreePath)) {
					if (body.mode === 'existing-branch') {
						try {
							await execAsync('git fetch origin', {
								cwd: body.cwd,
								timeout: 30000,
							});
						} catch {
							/* offline — on tente quand même avec l'état local */
						}
						const isLocal = localBranchExists(body.cwd, body.branch);
						const isRemote = !isLocal && remoteBranchExists(body.cwd, body.branch);
						if (!isLocal && !isRemote) {
							return fail(
								'worktree',
								`Branche "${body.branch}" introuvable (ni locale ni sur origin)`,
							);
						}
						const args = worktreeAddArgs({
							worktreePath,
							branch: body.branch,
							mode: 'existing-branch',
							isRemote,
							base: '',
						});
						await execFileAsync('git', ['-C', body.cwd, 'worktree', 'add', ...args], {
							cwd: body.cwd,
							timeout: 30000,
						});
					} else {
						let baseBranch = 'main';
						try {
							baseBranch = (
								await execAsync('git symbolic-ref refs/remotes/origin/HEAD', {
									cwd: body.cwd,
									timeout: 5000,
								})
							).stdout
								.trim()
								.replace('refs/remotes/origin/', '');
						} catch {
							/* fallback main */
						}
						try {
							await execAsync(`git fetch origin ${baseBranch}`, {
								cwd: body.cwd,
								timeout: 30000,
							});
						} catch {
							/* offline */
						}
						const args = worktreeAddArgs({
							worktreePath,
							branch: finalBranch,
							mode: 'worktree',
							isRemote: false,
							base: `origin/${baseBranch}`,
						});
						await execFileAsync('git', ['-C', body.cwd, 'worktree', 'add', ...args], {
							cwd: body.cwd,
							timeout: 30000,
						});
					}
				}
				sendSSE(res, 'step', { step: 'worktree', status: 'done' });

				// 3) copy files
				sendSSE(res, 'step', { step: 'copy-files', status: 'running' });
				copyConfiguredFiles(body.cwd, worktreePath, body.filesToCopy);
				try {
					const srcModules = join(body.cwd, 'node_modules');
					const destModules = join(worktreePath, 'node_modules');
					if (existsSync(srcModules) && !existsSync(destModules)) {
						symlinkSync(srcModules, destModules, 'dir');
					}
				} catch {
					/* non bloquant */
				}
				sendSSE(res, 'step', { step: 'copy-files', status: 'done' });

				// 4) setup script (streaming stdout/stderr en temps réel)
				if (body.setupScript && body.setupScript.trim()) {
					sendSSE(res, 'step', { step: 'setup', status: 'running' });
					const tail: string[] = [];
					const pushTail = (chunk: string) => {
						sendSSE(res, 'log', { step: 'setup', chunk });
						tail.push(chunk);
						if (tail.length > 40) tail.shift();
					};
					const code = await new Promise<number>((resolve) => {
						const child = spawn(body.setupScript, {
							cwd: worktreePath,
							shell: true,
							env: process.env,
						});
						child.stdout.on('data', (d: Buffer) => pushTail(d.toString()));
						child.stderr.on('data', (d: Buffer) => pushTail(d.toString()));
						child.on('error', (err) => {
							pushTail(err.message);
							resolve(1);
						});
						child.on('close', (c) => resolve(c ?? 0));
					});
					if (code === 0) {
						sendSSE(res, 'step', { step: 'setup', status: 'done' });
					} else {
						const lastLine =
							tail.join('').trim().split('\n').filter(Boolean).pop() ?? '';
						return fail('setup', `exit ${code}${lastLine ? ` — ${lastLine}` : ''}`);
					}
				}
			}

			// 5) done → session active + worktree_path + branch (dédup éventuel)
			db?.prepare(
				'UPDATE agent_sessions SET status = ?, worktree_path = ?, branch = ? WHERE session_id = ?',
			).run('active', producesWorktree ? worktreePath : null, finalBranch, body.sessionId);
			sendSSE(res, 'done', { step: 'done', worktreePath, branch: finalBranch });
			res.end();
		} catch (err) {
			return fail('worktree', err instanceof Error ? err.message : 'provision failed');
		}
		return;
	}

	// POST /git/run-script — exécute une commande dans un cwd (ex. archive_script)
	if (path === '/git/run-script' && method === 'POST') {
		try {
			const { cwd, script } = await readBody<{ cwd: string; script: string }>(req);
			if (!cwd || !script?.trim()) return sendJson(res, { ok: true });
			execSync(script, { cwd, encoding: 'utf-8', timeout: 120000 });
			sendJson(res, { ok: true });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'run-script failed');
		}
		return;
	}

	sendJson(res, { error: 'Not found' }, 404);
}
