import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Root of all Devora runtime state (persists across repo updates/reclones). */
export const DEVORA_HOME = process.env.DEVORA_HOME || join(homedir(), '.devora');
export const BIN_DIR = join(DEVORA_HOME, 'bin');
export const RUN_DIR = join(DEVORA_HOME, '.run');
export const LOGS_DIR = join(DEVORA_HOME, '.logs');
/** SQLite lives outside the repo so an update/reclone never wipes it. */
export const DB_PATH = process.env.DEVORA_DB_PATH || join(DEVORA_HOME, 'devora.db');
export const ENV_FILE = join(DEVORA_HOME, '.env');

/**
 * The repo the CLI operates on = the git root of the CLI's own location.
 * Works both from the dev checkout (Phase 1) and from ~/.devora/repo after install.
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
	for (const dir of [DEVORA_HOME, BIN_DIR, RUN_DIR, LOGS_DIR]) {
		mkdirSync(dir, { recursive: true });
	}
}
