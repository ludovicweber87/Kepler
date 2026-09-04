import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRemoteBaseRef } from './gitBase.js';

const execFileAsync = promisify(execFile);

export interface UpdateSignals {
	/** Branche courante du checkout Kepler, null si HEAD est détachée. */
	branch: string | null;
	/** Branche par défaut du remote (nom court, ex. 'main'), null si le repo n'a pas de remote. */
	defaultBranch: string | null;
	/** Commits que le checkout a en trop / en retard par rapport à la branche par défaut. */
	ahead: number;
	behind: number;
	/** SHA de la pointe distante — sert de clé de version côté UI. */
	remoteSha: string | null;
}

export interface KeplerUpdateStatus extends UpdateSignals {
	updateAvailable: boolean;
}

/**
 * Décide s'il faut réclamer un `kepler update`.
 *
 * Le retard n'est signalé que si le checkout est sur la branche par défaut :
 * une branche de feature est *toujours* en retard sur main, et harceler un dev
 * qui travaille dans son propre checkout n'aurait aucun sens. L'instance
 * installée (`~/.kepler/repo`) reste sur main, elle voit donc bien l'alerte.
 *
 * Fonction pure — testable sans git.
 */
export function buildUpdateStatus(signals: UpdateSignals): KeplerUpdateStatus {
	const onDefaultBranch =
		signals.branch !== null &&
		signals.defaultBranch !== null &&
		signals.branch === signals.defaultBranch;

	return {
		...signals,
		updateAvailable: onDefaultBranch && signals.behind > 0 && signals.remoteSha !== null,
	};
}

/**
 * Parse la sortie de `git rev-list --left-right --count HEAD...<base>`,
 * soit deux entiers séparés par une tabulation : « ahead<TAB>behind ».
 * Dégrade en 0/0 sur une sortie inattendue (repo sans commit, git muet).
 * Fonction pure.
 */
export function parseRevListCounts(raw: string): { ahead: number; behind: number } {
	const [ahead, behind] = raw.trim().split(/\s+/).map(Number);
	return {
		ahead: Number.isFinite(ahead) ? ahead : 0,
		behind: Number.isFinite(behind) ? behind : 0,
	};
}

async function git(cwd: string, args: string[], timeout = 10_000): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync('git', args, { cwd, timeout });
		return stdout.trim();
	} catch {
		return null;
	}
}

/**
 * Le repo Kepler = la racine git du module agent lui-même. Fonctionne depuis le
 * checkout de dev comme depuis `~/.kepler/repo` après installation.
 */
export async function resolveKeplerRepoDir(): Promise<string | null> {
	const here = dirname(fileURLToPath(import.meta.url));
	return git(here, ['rev-parse', '--show-toplevel'], 5_000);
}

/**
 * Interroge git sur l'état du checkout Kepler face à sa branche par défaut.
 * Rafraîchit d'abord les refs distants : sans `fetch`, le retard mesuré est
 * celui du dernier `git fetch` de l'utilisateur, donc souvent nul à tort.
 * Tout échec (offline, repo cassé) dégrade en signaux neutres.
 */
export async function readUpdateSignals(repoDir: string): Promise<UpdateSignals> {
	const base = resolveRemoteBaseRef(repoDir); // ex. 'origin/main'
	const defaultBranch = base ? base.replace(/^origin\//, '') : null;

	const branchRaw = await git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'], 5_000);
	const branch = branchRaw && branchRaw !== 'HEAD' ? branchRaw : null;

	if (!base) return { branch, defaultBranch, ahead: 0, behind: 0, remoteSha: null };

	// Le fetch est réseau : il peut être lent ou échouer, sans conséquence sur la suite.
	await git(repoDir, ['fetch', '--quiet', 'origin', defaultBranch!], 30_000);

	const counts = await git(repoDir, ['rev-list', '--left-right', '--count', `HEAD...${base}`]);
	const { ahead, behind } = counts ? parseRevListCounts(counts) : { ahead: 0, behind: 0 };
	const remoteSha = await git(repoDir, ['rev-parse', base], 5_000);

	return { branch, defaultBranch, ahead, behind, remoteSha };
}

/** État neutre : aucune mise à jour réclamée. Sert de repli quand git est hors-jeu. */
export function unknownUpdateStatus(): KeplerUpdateStatus {
	return buildUpdateStatus({
		branch: null,
		defaultBranch: null,
		ahead: 0,
		behind: 0,
		remoteSha: null,
	});
}
