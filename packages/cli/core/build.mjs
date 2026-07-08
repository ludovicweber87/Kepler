import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Prod build present? (.next for the app, dist for the agent) */
export function isBuilt(repoDir) {
	return (
		existsSync(join(repoDir, '.next')) &&
		existsSync(join(repoDir, 'packages/agent/dist/index.js'))
	);
}

/** Build the app (next build) and the agent (tsc). Inherits stdio for progress. */
export function build(repoDir, env) {
	execFileSync('npm', ['run', 'build'], { cwd: repoDir, stdio: 'inherit', env });
	execFileSync('npm', ['run', 'build', '-w', 'packages/agent'], {
		cwd: repoDir,
		stdio: 'inherit',
		env,
	});
}
