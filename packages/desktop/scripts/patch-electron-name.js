// Rename the unpackaged Electron.app to "Kepler" so macOS shows "Kepler"
// (not "Electron") in the menu bar, dock and About panel.
// Runs as a postinstall of packages/desktop.
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

if (process.platform !== 'darwin') process.exit(0);

const plist = join(
	__dirname,
	'..',
	'node_modules',
	'electron',
	'dist',
	'Electron.app',
	'Contents',
	'Info.plist',
);

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
