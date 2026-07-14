import { execFileSync } from 'node:child_process';

export interface RemoteBaseSignals {
	/** Sortie de `git symbolic-ref refs/remotes/origin/HEAD`, ex. 'refs/remotes/origin/main', sinon null. */
	symbolicRef: string | null;
	hasOriginMain: boolean;
	hasOriginMaster: boolean;
}

/**
 * Choisit le ref de base distant (court, ex. 'origin/main') à partir des signaux git.
 * Priorité : symbolic-ref origin/HEAD > origin/main > origin/master > 'origin/main' (défaut).
 * Fonction pure — testable sans git.
 */
export function selectRemoteBase(signals: RemoteBaseSignals): string {
	if (signals.symbolicRef) {
		const short = signals.symbolicRef.replace('refs/remotes/', '').trim();
		if (short) return short;
	}
	if (signals.hasOriginMain) return 'origin/main';
	if (signals.hasOriginMaster) return 'origin/master';
	return 'origin/main';
}

function refExists(cwd: string, ref: string): boolean {
	try {
		execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
			cwd,
			encoding: 'utf-8',
			timeout: 5000,
			stdio: ['pipe', 'pipe', 'ignore'],
		});
		return true;
	} catch {
		return false;
	}
}

/** Résout le ref de base distant réel du repo situé en `cwd` (sonde les refs). */
export function resolveRemoteBaseRef(cwd: string): string {
	let symbolicRef: string | null = null;
	try {
		symbolicRef = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
			cwd,
			encoding: 'utf-8',
			timeout: 5000,
			stdio: ['pipe', 'pipe', 'ignore'],
		}).trim();
	} catch {
		symbolicRef = null;
	}
	return selectRemoteBase({
		symbolicRef,
		hasOriginMain: refExists(cwd, 'refs/remotes/origin/main'),
		hasOriginMaster: refExists(cwd, 'refs/remotes/origin/master'),
	});
}
