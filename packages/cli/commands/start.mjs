import { join } from 'node:path';
import { ensureDirs, resolveRepoDir, DB_PATH, ENV_FILE } from '../core/paths.mjs';
import { parseEnvFile } from '../core/env.mjs';
import { isBuilt, build } from '../core/build.mjs';
import { AGENT_PORT, findFreePort, writePorts, readPorts } from '../core/ports.mjs';
import { spawnDetached, readPid, isAlive, CORE_SERVICES } from '../core/process.mjs';
import { launchDesktop } from '../core/desktop.mjs';
import { ghToken, checkGhAuth } from '../core/gh.mjs';
import { runStatus } from './status.mjs';

async function waitFor(url, label, timeoutMs = 30000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, { redirect: 'manual' });
			if (res.status > 0) return true;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 400));
	}
	throw new Error(`${label} did not come up within ${timeoutMs / 1000}s (see \`devora logs\`)`);
}

export async function runStart(opts = {}) {
	ensureDirs();
	const repoDir = resolveRepoDir();

	if (CORE_SERVICES.some((s) => isAlive(readPid(s)))) {
		console.log('Devora is already running.');
		// Reopen the window if it was closed but services are still up.
		if (opts.window !== false && !isAlive(readPid('desktop'))) {
			const ports = readPorts();
			if (ports?.web) launchDesktop(repoDir, ports.web);
		}
		console.log('');
		runStatus();
		return;
	}

	// Gate: GitHub access comes from `gh`. Guide first-time users instead of
	// launching an app that would be stuck with no way to authenticate.
	const gh = checkGhAuth();
	if (!gh.ok) {
		console.error('\n✗ GitHub is not connected.\n');
		console.error(`  → ${gh.fix}\n`);
		console.error('Then run `devora start` again.\n');
		return;
	}

	if (!isBuilt(repoDir)) {
		console.log('First run — building Devora (this can take a few minutes)...');
		build(repoDir, { ...process.env });
	}

	const web = await findFreePort(4000);
	const agent = AGENT_PORT;
	writePorts({ web, agent });

	// NB: we deliberately DON'T prepend Homebrew to PATH — it can shadow the
	// user's `node` (brew node vs nvm node) and break native modules built for a
	// different ABI (better-sqlite3). External tools (gh, tmux, claude) are
	// resolved by absolute path elsewhere, and the token is injected below.
	const token = ghToken(); // present — checkGhAuth() passed above

	const env = {
		...process.env,
		...parseEnvFile(ENV_FILE),
		DEVORA_DB_PATH: DB_PATH,
		DEVORA_AGENT_PORT: String(agent),
		NEXT_PUBLIC_AGENT_URL: `http://localhost:${agent}`,
		// Injected so the detached server needn't call gh at runtime.
		...(token ? { GITHUB_TOKEN: token } : {}),
	};

	console.log(`Starting agent on :${agent} ...`);
	spawnDetached('agent', 'node', [join(repoDir, 'packages/agent/dist/index.js')], {
		cwd: join(repoDir, 'packages/agent'),
		env,
	});

	console.log(`Starting web on :${web} ...`);
	spawnDetached('web', join(repoDir, 'node_modules/.bin/next'), ['start', '-p', String(web)], {
		cwd: repoDir,
		env: { ...env, PORT: String(web) },
	});

	await waitFor(`http://localhost:${agent}/health`, 'agent');
	await waitFor(`http://localhost:${web}`, 'web');

	const url = `http://localhost:${web}`;
	console.log(`\n✓ Devora running at ${url}`);

	if (opts.window !== false) {
		launchDesktop(repoDir, web);
	} else {
		console.log(`Open ${url} in your browser.`);
	}
}
