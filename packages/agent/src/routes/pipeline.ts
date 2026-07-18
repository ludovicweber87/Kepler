import { IncomingMessage, ServerResponse } from 'node:http';
import { readBody, sendJson, sendError } from '../helpers.js';
import {
	startRun,
	continueRun,
	stopRun,
	getRun,
	listRuns,
	type StartRunParams,
} from '../sdk/pipelineRunner.js';

export async function handlePipelineRoutes(
	req: IncomingMessage,
	res: ServerResponse,
	path: string,
) {
	const method = req.method ?? 'GET';

	// GET /pipeline-runs  → list
	if (path === '/pipeline-runs' && method === 'GET') {
		sendJson(res, listRuns());
		return;
	}

	// POST /pipeline-runs → start a run
	if (path === '/pipeline-runs' && method === 'POST') {
		try {
			const body = await readBody<StartRunParams>(req);
			if (!body.groupId || !body.worktreePath || !body.projectPath) {
				return sendJson(res, { error: 'groupId, worktreePath, projectPath required' }, 400);
			}
			const runId = startRun(body);
			sendJson(res, { runId });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Failed to start run');
		}
		return;
	}

	// /pipeline-runs/:id ...
	const m = path.match(/^\/pipeline-runs\/([^/]+)(\/(continue|stop))?$/);
	if (m) {
		const runId = m[1];
		const action = m[3];

		if (!action && method === 'GET') {
			const run = getRun(runId);
			if (!run) return sendJson(res, null, 404);
			sendJson(res, run);
			return;
		}
		if (action === 'continue' && method === 'POST') {
			sendJson(res, { ok: continueRun(runId) });
			return;
		}
		if (action === 'stop' && method === 'POST') {
			stopRun(runId);
			sendJson(res, { ok: true });
			return;
		}
	}

	sendJson(res, { error: 'Not found' }, 404);
}
