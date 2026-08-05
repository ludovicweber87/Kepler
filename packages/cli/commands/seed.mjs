import { DB_PATH } from '../core/paths.mjs';
import { PERSONAS, seedPersonas } from '../core/personas.mjs';

export async function runSeed({ overwrite = false } = {}) {
	const { inserted, updated, skipped } = seedPersonas(DB_PATH, { overwrite });

	console.log(`\nSeeding personas into ${DB_PATH}\n`);
	for (const name of inserted) console.log(`  + ${name}`);
	for (const name of updated) console.log(`  ~ ${name} (overwritten)`);
	for (const name of skipped) console.log(`  = ${name} (already present, left untouched)`);

	const parts = [];
	if (inserted.length) parts.push(`${inserted.length} added`);
	if (updated.length) parts.push(`${updated.length} overwritten`);
	if (skipped.length) parts.push(`${skipped.length} kept`);
	console.log(`\n✓ ${parts.join(' · ')} of ${PERSONAS.length}.`);

	if (skipped.length && !overwrite) {
		console.log('  Run `kepler seed --overwrite` to reset them to the seeded version.');
	}
}
