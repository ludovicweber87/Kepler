const { join } = require('node:path');
const { app, BrowserWindow, shell } = require('electron');

app.setName('Kepler');

/**
 * Icône de l'app : le mark de marque, source unique `public/logo.svg` (rendu en
 * `public/logo.png`). Electron n'étant pas packagé ici, le bundle est
 * `Electron.app` — son `.icns` est remplacé au postinstall
 * (`scripts/patch-electron-app.js`), et `dock.setIcon` couvre le Dock de la
 * session en cours sans dépendre du cache d'icônes de macOS.
 */
const APP_ICON = join(__dirname, '..', '..', '..', 'public', 'logo.png');

const PORT = process.env.KEPLER_WEB_PORT || '4000';
const SERVER_URL = `http://localhost:${PORT}`;

function loadWithRetry(win, attempts = 0) {
	win.loadURL(SERVER_URL).catch(() => {
		if (attempts < 40 && !win.isDestroyed()) {
			setTimeout(() => loadWithRetry(win, attempts + 1), 500);
		}
	});
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		title: 'Kepler',
		icon: APP_ICON,
		backgroundColor: '#1A1A1A',
		autoHideMenuBar: true,
		webPreferences: { contextIsolation: true },
	});

	loadWithRetry(win);

	// Open external (non-app) links in the OS browser, not inside the window.
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (!url.startsWith(SERVER_URL)) {
			shell.openExternal(url);
			return { action: 'deny' };
		}
		return { action: 'allow' };
	});
}

app.whenReady().then(() => {
	// `icon` est ignoré sur macOS : le Dock lit le bundle. On le force ici.
	if (process.platform === 'darwin') app.dock?.setIcon(APP_ICON);
	createWindow();
});

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
	app.quit();
});
