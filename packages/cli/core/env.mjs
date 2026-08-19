import { readFileSync } from 'node:fs';

/** Minimal .env parser (KEY=VALUE, # comments, optional quotes). No dependency. */
export function parseEnvFile(path) {
	let raw;
	try {
		raw = readFileSync(path, 'utf-8');
	} catch {
		return {};
	}
	const out = {};
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let val = trimmed.slice(eq + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1);
		}
		if (key) out[key] = val;
	}
	return out;
}
