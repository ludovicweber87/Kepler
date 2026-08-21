import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Repo géré par pnpm ? Lockfile, workspace file, champ `packageManager`, ou — signal le plus
 * direct — un `node_modules` déjà créé par pnpm (présence de son `.modules.yaml`).
 */
export function isPnpmManaged(cwd: string): boolean {
	if (
		existsSync(join(cwd, 'pnpm-lock.yaml')) ||
		existsSync(join(cwd, 'pnpm-workspace.yaml')) ||
		existsSync(join(cwd, 'node_modules', '.modules.yaml'))
	)
		return true;
	try {
		const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')) as {
			packageManager?: unknown;
		};
		return typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm');
	} catch {
		return false;
	}
}

/**
 * Symlinke le `node_modules` du repo principal dans le worktree pour éviter un install complet.
 *
 * Sauté sur les repos pnpm : l'install du worktree passerait *à travers* le lien et réécrirait
 * le `node_modules/.modules.yaml` partagé avec un `virtualStoreDir` relatif au worktree. Les
 * `pnpm install` suivants (repo principal ou autre worktree) détectent alors une incompatibilité,
 * veulent purger `node_modules`, demandent confirmation et abandonnent faute de TTY
 * (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
 *
 * Non bloquant : toute erreur est ignorée.
 */
export function linkNodeModules(sourceCwd: string, worktreePath: string): void {
	try {
		if (isPnpmManaged(sourceCwd)) return;
		const src = join(sourceCwd, 'node_modules');
		const dest = join(worktreePath, 'node_modules');
		if (existsSync(src) && !existsSync(dest)) symlinkSync(src, dest, 'dir');
	} catch {
		/* non bloquant */
	}
}
