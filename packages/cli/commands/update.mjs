import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, rmSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRepoDir, BIN_DIR, ensureDirs } from '../core/paths.mjs';

function run(cmd, args, cwd) {
	execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

/** Keep ~/.devora/bin/devora pointing at <repo>/cli/devora (self-updatable CLI). */
function ensureSymlink(repoDir) {
	const target = join(repoDir, 'cli', 'devora');
	const link = join(BIN_DIR, 'devora');
	mkdirSync(BIN_DIR, { recursive: true });
	try {
		execFileSync('chmod', ['+x', target]);
	} catch {
		/* ignore */
	}
	try {
		if (readlinkSync(link) === target) return;
		rmSync(link);
	} catch {
		if (existsSync(link)) {
			try {
				rmSync(link);
			} catch {
				/* ignore */
			}
		}
	}
	symlinkSync(target, link);
}

export function runUpdate() {
	ensureDirs();
	const repoDir = resolveRepoDir();

	if (!existsSync(join(repoDir, '.git'))) {
		throw new Error(`${repoDir} is not a git repo — cannot update.`);
	}

	console.log('Rebasing on origin/main...');
	try {
		run('git', ['-C', repoDir, 'pull', '--rebase', 'origin', 'main'], repoDir);
	} catch {
		console.warn('Rebase failed — trying a plain merge...');
		try {
			run('git', ['-C', repoDir, 'pull', 'origin', 'main'], repoDir);
		} catch {
			throw new Error(
				`git pull failed. Resolve conflicts in ${repoDir} manually, then retry.`,
			);
		}
	}

	console.log('Installing dependencies...');
	run('npm', ['install'], repoDir);

	console.log('Building...');
	run('npm', ['run', 'build'], repoDir);
	run('npm', ['run', 'build', '-w', 'packages/agent'], repoDir);

	ensureSymlink(repoDir);

	console.log('\n✓ Updated. Running instance is unchanged — apply with: devora restart');
}
