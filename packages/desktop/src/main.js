const { app, BrowserWindow, shell } = require('electron');

const PORT = process.env.DEVORA_WEB_PORT || '4000';
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
		title: 'Devora',
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

app.whenReady().then(createWindow);

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
	app.quit();
});
