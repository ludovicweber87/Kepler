import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function headSha(repoDir) {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], {
			cwd: repoDir,
			encoding: 'utf-8',
		}).trim();
	} catch {
		return null;
	}
}

const shaFile = (repoDir) => join(repoDir, '.next', 'DEVORA_BUILT_SHA');

/**
 * A usable prod build exists AND matches the checked-out commit.
 * The SHA check means `start`/`restart` rebuild automatically after an update
 * (a stale .next from a previous commit no longer counts as "built").
 */
export function isBuilt(repoDir) {
	if (
		!existsSync(join(repoDir, '.next')) ||
		!existsSync(join(repoDir, 'packages/agent/dist/index.js'))
	) {
		return false;
	}
	const head = headSha(repoDir);
	if (!head) return true; // not a git checkout — can't tell, assume built
	let built = null;
	try {
		built = readFileSync(shaFile(repoDir), 'utf-8').trim();
	} catch {
		/* never stamped → treat as stale */
	}
	return built === head;
}

/** Build the app (next build) and the agent (tsc), then stamp the built commit. */
export function build(repoDir, env) {
	execFileSync('npm', ['run', 'build'], { cwd: repoDir, stdio: 'inherit', env });
	execFileSync('npm', ['run', 'build', '-w', 'packages/agent'], {
		cwd: repoDir,
		stdio: 'inherit',
		env,
	});
	const head = headSha(repoDir);
	if (head) {
		try {
			writeFileSync(shaFile(repoDir), head);
		} catch {
			/* non-fatal */
		}
	}
}
