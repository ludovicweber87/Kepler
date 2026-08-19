import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { RUN_DIR, LOGS_DIR } from './paths.mjs';

/** Long-running backend services (used for the "already running" guard). */
export const CORE_SERVICES = ['agent', 'web'];
/** All managed processes, incl. the Electron window — used by stop/status. */
export const SERVICES = ['agent', 'web', 'desktop'];

const pidFile = (svc) => join(RUN_DIR, `${svc}.pid`);
export const logFile = (svc) => join(LOGS_DIR, `${svc}.log`);

export function savePid(svc, pid) {
	writeFileSync(pidFile(svc), String(pid));
}

export function readPid(svc) {
	try {
		const pid = parseInt(readFileSync(pidFile(svc), 'utf-8').trim(), 10);
		return Number.isFinite(pid) ? pid : null;
	} catch {
		return null;
	}
}

export function clearPid(svc) {
	try {
		unlinkSync(pidFile(svc));
	} catch {
		/* already gone */
	}
}

export function isAlive(pid) {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Spawn a service detached (own process group) with output appended to its log.
 * Returns the pid. The process survives the CLI exiting.
 */
export function spawnDetached(svc, cmd, args, { cwd, env }) {
	const out = openSync(logFile(svc), 'a');
	const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ['ignore', out, out] });
	child.unref();
	savePid(svc, child.pid);
	return child.pid;
}

/** Kill the whole process group (negative pid). */
export function killGroup(pid, sig = 'SIGTERM') {
	try {
		process.kill(-pid, sig);
	} catch {
		/* group gone */
	}
}

/** Kill a process and its descendants (via pgrep -P), depth-first. */
export function killTree(pid, sig = 'SIGTERM') {
	let children = [];
	try {
		children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf-8' })
			.trim()
			.split('\n')
			.filter(Boolean)
			.map(Number);
	} catch {
		/* no children */
	}
	for (const c of children) killTree(c, sig);
	try {
		process.kill(pid, sig);
	} catch {
		/* gone */
	}
}

/** Last-resort reap: kill whatever still holds a TCP port (orphaned watchers). */
export function killByPort(port, sig = 'SIGKILL') {
	try {
		const pids = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf-8' })
			.trim()
			.split('\n')
			.filter(Boolean)
			.map(Number);
		for (const p of pids) {
			try {
				process.kill(p, sig);
			} catch {
				/* gone */
			}
		}
	} catch {
		/* nothing on port */
	}
}
