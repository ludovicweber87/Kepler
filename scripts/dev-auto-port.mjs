import { createServer } from 'net';
import { spawn } from 'child_process';
import { resolve as resolvePath } from 'path';

const webOnly = process.argv.includes('--web-only');

function isPortAvailable(port) {
	return new Promise((resolve) => {
		const server = createServer();
		server.listen(port, '0.0.0.0', () => {
			server.close(() => resolve(true));
		});
		server.on('error', () => resolve(false));
	});
}

async function findAvailablePort(start = 4000, range = 20) {
	for (let port = start; port < start + range; port++) {
		if (await isPortAvailable(port)) return port;
	}
	throw new Error(`No available port found in range ${start}-${start + range}`);
}

const port = await findAvailablePort(4000);

if (port !== 4000) {
	console.log(`\x1b[33m⚠ Port 4000 in use → starting on port ${port}\x1b[0m`);
} else {
	console.log(`\x1b[32m✓ Starting on port ${port}\x1b[0m`);
}

const args = webOnly
	? ['next', 'dev', '-p', String(port)]
	: ['concurrently', `next dev -p ${port}`, 'npm run dev -w packages/agent'];

// Chemin absolu partagé de la DB SQLite : l'app Next et le serveur agent (cwd différents)
// ouvrent ainsi le même fichier data/kepler.db.
const child = spawn('npx', args, {
	stdio: 'inherit',
	env: {
		...process.env,
		PORT: String(port),
		KEPLER_DB_PATH: resolvePath('data', 'kepler.db'),
	},
});

child.on('exit', (code) => process.exit(code ?? 0));
