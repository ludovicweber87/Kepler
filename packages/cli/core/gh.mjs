import { execFileSync } from 'node:child_process';

const GH_PATHS = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh', 'gh'];

/** Run gh, resolving its binary by absolute path first (server may have a minimal PATH). */
function gh(args, opts = {}) {
	let lastErr;
	for (const bin of GH_PATHS) {
		try {
			return execFileSync(bin, args, { encoding: 'utf-8', timeout: 8000, ...opts });
		} catch (e) {
			lastErr = e;
			if (e.code !== 'ENOENT') throw e; // found but failed → real error
		}
	}
	throw Object.assign(lastErr ?? new Error('gh not found'), { code: 'GH_NOT_FOUND' });
}

/** The gh session token, or null. */
export function ghToken() {
	try {
		return gh(['auth', 'token']).trim() || null;
	} catch {
		return null;
	}
}

/**
 * Verify gh is installed, logged in, and has the `project` scope (needed for
 * GitHub Project V2). Returns { ok:true } or { ok:false, reason, fix }.
 */
export function checkGhAuth() {
	try {
		gh(['--version'], { stdio: 'ignore' });
	} catch (e) {
		if (e.code === 'GH_NOT_FOUND') {
			return {
				ok: false,
				reason: 'not_installed',
				fix: 'Install the GitHub CLI: https://cli.github.com',
			};
		}
		throw e;
	}

	let headers;
	try {
		// `-i` includes response headers, which carry X-Oauth-Scopes. Fails if not logged in.
		headers = gh(['api', 'rate_limit', '-i'], { stdio: ['ignore', 'pipe', 'ignore'] });
	} catch {
		return {
			ok: false,
			reason: 'not_logged_in',
			fix: 'Connect your GitHub account:  gh auth login -s "repo,read:org,project"',
		};
	}

	const scopes = (headers.match(/x-oauth-scopes:\s*(.*)/i)?.[1] ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	if (!scopes.includes('project') && !scopes.includes('read:project')) {
		return {
			ok: false,
			reason: 'missing_scope',
			fix: 'Grant the project scope (for the kanban):  gh auth refresh -s project',
		};
	}

	return { ok: true };
}
