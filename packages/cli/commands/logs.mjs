import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { SERVICES, logFile } from '../core/process.mjs';

export function runLogs(service) {
	const services = service ? [service] : SERVICES;
	const files = services.map(logFile).filter(existsSync);

	if (files.length === 0) {
		console.log('No logs yet. Start Kepler with `kepler start`.');
		return;
	}

	// tail -f follows all selected service logs.
	const child = spawn('tail', ['-n', '40', '-F', ...files], { stdio: 'inherit' });
	child.on('exit', (code) => process.exit(code ?? 0));
}
