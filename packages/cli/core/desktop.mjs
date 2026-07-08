import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { spawnDetached } from './process.mjs';

/** Electron is installed on demand (kept out of the root workspace to stay light). */
function ensureElectron(repoDir) {
	const desktopDir = join(repoDir, 'packages/desktop');
	const electronBin = join(desktopDir, 'node_modules/.bin/electron');
	if (!existsSync(electronBin)) {
		console.log('Installing the desktop window (Electron, first run only)...');
		execFileSync('npm', ['install'], { cwd: desktopDir, stdio: 'inherit' });
	}
	return electronBin;
}

/** Open the native app window pointing at the local server. Detached + pid-tracked. */
export function launchDesktop(repoDir, webPort) {
	const desktopDir = join(repoDir, 'packages/desktop');
	const electronBin = ensureElectron(repoDir);
	spawnDetached('desktop', electronBin, [desktopDir], {
		cwd: repoDir,
		env: { ...process.env, DEVORA_WEB_PORT: String(webPort) },
	});
}
