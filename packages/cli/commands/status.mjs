import { SERVICES, readPid, isAlive } from '../core/process.mjs';
import { readPorts } from '../core/ports.mjs';

export function runStatus() {
	const ports = readPorts() ?? {};
	let anyRunning = false;

	console.log('SERVICE   STATUS    PID     URL');
	for (const svc of SERVICES) {
		const pid = readPid(svc);
		const alive = isAlive(pid);
		if (alive) anyRunning = true;
		const status = alive ? 'running' : pid ? 'dead' : 'stopped';
		const port = svc === 'web' ? ports.web : svc === 'agent' ? ports.agent : undefined;
		const url = port ? `http://localhost:${port}` : '';
		console.log(
			`${svc.padEnd(9)} ${status.padEnd(9)} ${String(pid ?? '-').padEnd(7)} ${url}`,
		);
	}

	if (!anyRunning) console.log('\nKepler is not running. Start it with `kepler start`.');
}
