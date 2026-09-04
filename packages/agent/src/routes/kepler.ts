import { IncomingMessage, ServerResponse } from 'node:http';
import { parseQuery, sendJson } from '../helpers.js';
import {
	buildUpdateStatus,
	readUpdateSignals,
	resolveKeplerRepoDir,
	unknownUpdateStatus,
	type KeplerUpdateStatus,
} from '../keplerUpdate.js';

/**
 * Le calcul fait un `git fetch` : on le mémoïse pour que plusieurs onglets (ou un
 * refetch au focus) ne déclenchent pas un aller-retour réseau chacun.
 */
const CACHE_TTL_MS = 5 * 60_000;
let cache: { at: number; status: KeplerUpdateStatus } | null = null;

async function computeStatus(): Promise<KeplerUpdateStatus> {
	const repoDir = await resolveKeplerRepoDir();
	if (!repoDir) return unknownUpdateStatus();
	return buildUpdateStatus(await readUpdateSignals(repoDir));
}

export async function handleKeplerRoutes(req: IncomingMessage, res: ServerResponse, path: string) {
	const method = req.method ?? 'GET';

	// GET /kepler/update-status[?force=1] → retard du checkout sur origin/<défaut>
	if (path === '/kepler/update-status' && method === 'GET') {
		const force = parseQuery(req).get('force') === '1';
		if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
			return sendJson(res, cache.status);
		}
		// Jamais d'erreur 500 ici : ne pas savoir si une mise à jour existe ne doit
		// pas remonter comme une panne côté UI.
		const status = await computeStatus().catch(() => unknownUpdateStatus());
		cache = { at: Date.now(), status };
		return sendJson(res, status);
	}

	sendJson(res, { error: 'Not found' }, 404);
}
