// Fait passer l'Electron non packagé pour Kepler : nom affiché (menu bar, dock,
// À propos) et icône du bundle. Sans ça macOS annonce "Electron" avec l'icône
// par défaut. Postinstall de packages/desktop, best-effort et idempotent.
const { execFileSync } = require('node:child_process');
const {
	existsSync,
	statSync,
	readFileSync,
	writeFileSync,
	mkdtempSync,
	mkdirSync,
	copyFileSync,
	rmSync,
} = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

if (process.platform !== 'darwin') process.exit(0);

const APP = join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app');
const plist = join(APP, 'Contents', 'Info.plist');

if (!existsSync(plist)) process.exit(0);

function set(key, value) {
	try {
		execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist], {
			stdio: 'ignore',
		});
	} catch {
		try {
			execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist], {
				stdio: 'ignore',
			});
		} catch {
			/* best-effort */
		}
	}
}

set('CFBundleName', 'Kepler');
set('CFBundleDisplayName', 'Kepler');
console.log('[kepler-desktop] Electron.app renamed to "Kepler"');

/**
 * Icône du bundle : dérivée de `public/logo.png`, lui-même rendu de
 * `public/logo.svg` — la source unique du mark. On écrase `electron.icns` plutôt
 * que d'ajouter un fichier, pour ne pas toucher à `CFBundleIconFile`.
 */
const source = join(__dirname, '..', '..', '..', 'public', 'logo.png');
const target = join(APP, 'Contents', 'Resources', 'electron.icns');
const SIZES = [16, 32, 64, 128, 256, 512];

if (!existsSync(source)) process.exit(0);

// Le script est aussi rejoué à chaque `kepler start` (le postinstall ne se
// redéclenche pas sur une install existante) : ce marqueur évite de reconstruire
// l'icns tant que le logo n'a pas bougé.
const stamp = join(APP, 'Contents', 'Resources', '.kepler-icon');
const fingerprint = (() => {
	const { size, mtimeMs } = statSync(source);
	return `${size}:${mtimeMs}`;
})();
try {
	if (existsSync(stamp) && readFileSync(stamp, 'utf8') === fingerprint) process.exit(0);
} catch {
	/* marqueur illisible : on reconstruit */
}

let work;
try {
	work = mkdtempSync(join(tmpdir(), 'kepler-icon-'));
	const iconset = join(work, 'kepler.iconset');
	mkdirSync(iconset);

	// iconutil attend les paires @1x/@2x : le @2x d'une taille est le @1x de la suivante.
	for (const size of SIZES) {
		const png = join(iconset, `icon_${size}x${size}.png`);
		execFileSync('sips', ['-z', String(size), String(size), source, '--out', png], {
			stdio: 'ignore',
		});
		const half = size / 2;
		if (SIZES.includes(half)) copyFileSync(png, join(iconset, `icon_${half}x${half}@2x.png`));
	}

	const icns = join(work, 'kepler.icns');
	execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { stdio: 'ignore' });
	copyFileSync(icns, target);
	writeFileSync(stamp, fingerprint);
	// Nudge LaunchServices/Finder : sans ça le bundle garde l'icône en cache.
	execFileSync('touch', [APP]);
	console.log('[kepler-desktop] Electron.app icon replaced with the Kepler mark');
} catch {
	console.log('[kepler-desktop] could not build the app icon (non-blocking)');
} finally {
	if (work) rmSync(work, { recursive: true, force: true });
}
