import { execFileSync } from 'node:child_process';

export interface RemoteBaseSignals {
	/** Sortie de `git symbolic-ref refs/remotes/origin/HEAD`, ex. 'refs/remotes/origin/main', sinon null. */
	symbolicRef: string | null;
	hasOriginMain: boolean;
	hasOriginMaster: boolean;
}

/**
 * Choisit le ref de base distant (court, ex. 'origin/main') à partir des signaux git.
 * Priorité : symbolic-ref origin/HEAD > origin/main > origin/master > null.
 * Renvoie null plutôt qu'un 'origin/main' inventé : un ref inexistant fait échouer les
 * commandes en aval, alors que null laisse l'appelant dégrader proprement.
 * Fonction pure — testable sans git.
 */
export function selectRemoteBase(signals: RemoteBaseSignals): string | null {
	if (signals.symbolicRef) {
		const short = signals.symbolicRef.replace('refs/remotes/', '').trim();
		if (short) return short;
	}
	if (signals.hasOriginMain) return 'origin/main';
	if (signals.hasOriginMaster) return 'origin/master';
	return null;
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

/** Résout le ref de base distant réel du repo situé en `cwd`, ou null s'il n'en a pas. */
export function resolveRemoteBaseRef(cwd: string): string | null {
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

/**
 * Point de comparaison du diff d'un worktree : le merge-base avec la base distante quand
 * on peut le calculer, sinon `HEAD` — on montre alors le travail non commité plutôt que rien.
 * Sans ce fallback, un repo sans base distante (branche par défaut nommée autrement, remote
 * absent) ou aux histoires disjointes faisait échouer `merge-base`, et le panneau des
 * changements se retrouvait vide comme si le worktree était propre.
 */
export function resolveDiffBase(cwd: string, baseRef: string | null): string {
	if (!baseRef) return 'HEAD';
	try {
		const mergeBase = execFileSync('git', ['merge-base', baseRef, 'HEAD'], {
			cwd,
			encoding: 'utf-8',
			timeout: 5000,
			stdio: ['pipe', 'pipe', 'ignore'],
		}).trim();
		return mergeBase || 'HEAD';
	} catch {
		return 'HEAD';
	}
}
