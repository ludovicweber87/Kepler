import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Chemin du fichier SQLite partagé avec l'app Next.
 *
 * `KEPLER_DB_PATH` est injecté par le CLI et par `scripts/dev-auto-port.mjs`.
 *
 * Résolu ici et nulle part ailleurs : `db.ts` et `sdk/attachments.ts` calculaient
 * chacun leur chemin relatif (`../../../` vs `../../../../`), ce qui ne pouvait
 * que diverger — `attachmentsDir()` en dérive le dossier des pièces jointes.
 */
export function resolveDbPath(): string {
	const fromEnv = process.env.KEPLER_DB_PATH;
	if (fromEnv) return fromEnv;

	return fileURLToPath(new URL('../../../data/kepler.db', import.meta.url));
}
