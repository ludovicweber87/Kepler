import { runSeed } from '../packages/cli/commands/seed.mjs';

/**
 * Équivalent de `kepler seed`, utilisable depuis le checkout de dev sans passer par
 * le CLI installé (`npm run seed:personas [-- --overwrite]`).
 *
 * Les définitions et la logique vivent dans `packages/cli/core/personas.mjs` : ce
 * fichier portait auparavant sa propre copie des personas et sa propre résolution du
 * chemin de base, les deux ayant divergé de la réalité.
 */
await runSeed({ overwrite: process.argv.includes('--overwrite') });
