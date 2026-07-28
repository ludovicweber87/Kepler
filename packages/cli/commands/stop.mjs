import {
	SERVICES,
	readPid,
	clearPid,
	isAlive,
	killGroup,
	killTree,
	killByPort,
} from '../core/process.mjs';
import { readPorts } from '../core/ports.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runStop() {
	let stopped = 0;

	for (const svc of SERVICES) {
		const pid = readPid(svc);
		if (pid && isAlive(pid)) {
			// 3-step: group → tree → SIGKILL escalation.
			killGroup(pid, 'SIGTERM');
			killTree(pid, 'SIGTERM');
			await sleep(200);
			if (isAlive(pid)) {
				killGroup(pid, 'SIGKILL');
				killTree(pid, 'SIGKILL');
			}
			stopped++;
			console.log(`Stopped ${svc} (pid ${pid}).`);
		}
		clearPid(svc);
	}

	// Defense in depth: reap anything still holding the ports (orphaned watchers).
	const ports = readPorts();
	if (ports) {
		for (const port of [ports.web, ports.agent].filter(Boolean)) killByPort(port);
	}

	console.log(stopped ? '\n✓ Kepler stopped.' : 'Kepler was not running.');
}
