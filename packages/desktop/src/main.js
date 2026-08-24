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

/**
 * `shell.openExternal` délègue à l'OS : on ne lui passe que des schémas web, pour
 * qu'un `file:` ou un `javascript:` glissé dans du contenu rendu (markdown d'agent,
 * page GitHub) ne puisse pas lancer autre chose qu'une page.
 */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function protocolOf(url) {
	try {
		return new URL(url).protocol;
	} catch {
		return null;
	}
}

function isAppUrl(url) {
	try {
		return new URL(url).origin === new URL(SERVER_URL).origin;
	} catch {
		return false;
	}
}

function openInDefaultBrowser(url) {
	if (EXTERNAL_PROTOCOLS.has(protocolOf(url))) shell.openExternal(url);
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

	// Tout lien hors app part dans le navigateur par défaut, qu'il demande une
	// nouvelle fenêtre (`target="_blank"`) ou qu'il navigue sur place : sans le
	// second cas, un lien sans `target` — ceux du markdown des agents, par
	// exemple — remplace l'app par la page distante dans la même fenêtre.
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (isAppUrl(url)) return { action: 'allow' };
		openInDefaultBrowser(url);
		return { action: 'deny' };
	});

	const keepNavigationOutside = (event, url) => {
		if (isAppUrl(url)) return;
		event.preventDefault();
		openInDefaultBrowser(url);
	};

	win.webContents.on('will-navigate', keepNavigationOutside);
	win.webContents.on('will-frame-navigate', (event) => keepNavigationOutside(event, event.url));
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
