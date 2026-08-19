import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Root of all Kepler runtime state (persists across repo updates/reclones). */
export const KEPLER_HOME = process.env.KEPLER_HOME || join(homedir(), '.kepler');
export const BIN_DIR = join(KEPLER_HOME, 'bin');
export const RUN_DIR = join(KEPLER_HOME, '.run');
export const LOGS_DIR = join(KEPLER_HOME, '.logs');
export const ENV_FILE = join(KEPLER_HOME, '.env');

/** SQLite lives outside the repo so an update/reclone never wipes it. */
export const DB_PATH = process.env.KEPLER_DB_PATH || join(KEPLER_HOME, 'kepler.db');

/**
 * The repo the CLI operates on = the git root of the CLI's own location.
 * Works both from the dev checkout (Phase 1) and from ~/.kepler/repo after install.
 */
export function resolveRepoDir() {
	const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/core
	try {
		return execFileSync('git', ['rev-parse', '--show-toplevel'], {
			cwd: here,
			encoding: 'utf-8',
		}).trim();
	} catch {
		return join(here, '..', '..', '..');
	}
}

export function ensureDirs() {
	for (const dir of [KEPLER_HOME, BIN_DIR, RUN_DIR, LOGS_DIR]) {
		mkdirSync(dir, { recursive: true });
	}
}
