import { createServer } from 'node:net';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUN_DIR } from './paths.mjs';

/**
 * Agent port is FIXED: the Next client reads NEXT_PUBLIC_AGENT_URL at build time,
 * so the agent must live where the built bundle expects it (localhost:4001).
 */
export const AGENT_PORT = 4001;

const portsFile = join(RUN_DIR, 'ports.json');

function isFree(port) {
	return new Promise((resolve) => {
		const srv = createServer();
		srv.once('error', () => resolve(false));
		srv.once('listening', () => srv.close(() => resolve(true)));
		srv.listen(port, '0.0.0.0');
	});
}

/** First free port >= start, skipping the reserved agent port. */
export async function findFreePort(start = 4000, range = 40) {
	for (let port = start; port < start + range; port++) {
		if (port === AGENT_PORT) continue;
		if (await isFree(port)) return port;
	}
	throw new Error(`No free port found in ${start}-${start + range}`);
}

export function writePorts(ports) {
	writeFileSync(portsFile, JSON.stringify(ports, null, 2));
}

export function readPorts() {
	try {
		return JSON.parse(readFileSync(portsFile, 'utf-8'));
	} catch {
		return null;
	}
}
