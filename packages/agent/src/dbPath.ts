import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Chemin du fichier SQLite partagé avec l'app Next.
 *
 * `KEPLER_DB_PATH` est injecté par le CLI et par `scripts/dev-auto-port.mjs`.
 * `DEVORA_DB_PATH` est l'ancien nom de cette même variable : un process lancé
 * avant le renommage porte encore l'ancienne clé dans son environnement, et on
 * préfère lire la bonne base plutôt que d'en créer une vide à côté.
 *
 * Résolu ici et nulle part ailleurs : `db.ts` et `sdk/attachments.ts` calculaient
 * chacun leur chemin relatif (`../../../` vs `../../../../`), ce qui ne pouvait
 * que diverger — `attachmentsDir()` en dérive le dossier des pièces jointes.
 */
export function resolveDbPath(): string {
	const fromEnv = process.env.KEPLER_DB_PATH ?? process.env.DEVORA_DB_PATH;
	if (fromEnv) return fromEnv;

	const current = fileURLToPath(new URL('../../../data/kepler.db', import.meta.url));
	if (existsSync(current)) return current;

	const legacy = fileURLToPath(new URL('../../../data/devora.db', import.meta.url));
	return existsSync(legacy) ? legacy : current;
}
