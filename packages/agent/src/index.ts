#!/usr/bin/env node
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { parsePath, sendJson, sendError } from './helpers.js';
import { startTerminalServer } from './terminal.js';
import { handleGitRoutes } from './routes/git.js';
import { handleSessionRoutes } from './routes/sessions.js';
import { handleChatRoutes } from './routes/chat.js';
import { handleFilesystemRoutes } from './routes/filesystem.js';
import { handlePipelineRoutes } from './routes/pipeline.js';
import { handleRecapRoutes } from './routes/recap.js';
import { handleNotificationsStream } from './routes/notifications.js';
import { serveAttachment } from './sdk/attachments.js';
import { startGithubPoller } from './notifications/githubPoller.js';

const PORT = parseInt(process.env.DEVORA_AGENT_PORT ?? '4001', 10);
const ALLOWED_ORIGINS = (process.env.DEVORA_ORIGIN ?? 'http://localhost:4000')
	.split(',')
	.map((o) => o.trim());

function setCors(req: IncomingMessage, res: ServerResponse) {
	const origin = req.headers.origin ?? '';
	// Allow any localhost port in dev, or explicit origins from env
	const allowed =
		ALLOWED_ORIGINS.includes(origin) ||
		/^https?:\/\/localhost(:\d+)?$/.test(origin) ||
		/^https:\/\/devora[a-z0-9-]*\.vercel\.app$/.test(origin);
	if (allowed) {
		res.setHeader('Access-Control-Allow-Origin', origin);
	}
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
	setCors(req, res);

	// Preflight
	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return;
	}

	const path = parsePath(req);

	try {
		// Health check
		if (path === '/health' && req.method === 'GET') {
			sendJson(res, { ok: true });
			return;
		}

		// Route dispatch
		if (path.startsWith('/git/')) {
			await handleGitRoutes(req, res, path);
			return;
		}

		if (path.startsWith('/sessions') || path.startsWith('/agent-sessions/')) {
			await handleSessionRoutes(req, res, path);
			return;
		}

		if (path === '/chat' && req.method === 'POST') {
			await handleChatRoutes(req, res);
			return;
		}

		if (path.startsWith('/filesystem/')) {
			await handleFilesystemRoutes(req, res, path);
			return;
		}

		if (path.startsWith('/pipeline-runs')) {
			await handlePipelineRoutes(req, res, path);
			return;
		}

		if (path.startsWith('/recap/')) {
			await handleRecapRoutes(req, res, path);
			return;
		}

		if (path.startsWith('/attachments/') && req.method === 'GET') {
			serveAttachment(req, res, path);
			return;
		}

		if (path === '/notifications/stream' && req.method === 'GET') {
			handleNotificationsStream(req, res);
			return;
		}

		sendJson(res, { error: 'Not found' }, 404);
	} catch (err) {
		console.error('[agent] Unhandled error:', err);
		sendError(res, err instanceof Error ? err.message : 'Internal server error');
	}
}

// ── Resilience: a terminal/pty error must never take down the whole agent ──
process.on('unhandledRejection', (reason) => {
	console.error('[devora-agent] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
	console.error('[devora-agent] Uncaught exception:', err);
});

// ── Start ──

const server = createServer(handleRequest);

// WebSocket upgrade for terminal
startTerminalServer(server);

// EADDRINUSE is common when `tsx watch` restarts before the previous process
// frees the port. Retry a few times, then fail loudly instead of lingering as a
// zombie that never binds (the source of "[Session disconnected]" in the UI).
const MAX_LISTEN_RETRIES = 10;
let listenRetries = 0;

server.on('error', (err: NodeJS.ErrnoException) => {
	if (err.code === 'EADDRINUSE' && listenRetries < MAX_LISTEN_RETRIES) {
		listenRetries++;
		console.warn(
			`[devora-agent] Port ${PORT} occupé, nouvelle tentative ${listenRetries}/${MAX_LISTEN_RETRIES}...`,
		);
		setTimeout(() => server.listen(PORT), 500);
		return;
	}
	console.error(`[devora-agent] Impossible de démarrer sur le port ${PORT}: ${err.message}`);
	process.exit(1);
});

server.listen(PORT, () => {
	listenRetries = 0;
	console.log(`[devora-agent] Running on http://localhost:${PORT}`);
	console.log(`[devora-agent] CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

// ── Notifications: server-side GitHub poller (CI/PR/notifs → SSE) ──
const stopGithubPoller = startGithubPoller();
process.on('SIGTERM', () => {
	stopGithubPoller();
});
process.on('SIGINT', () => {
	stopGithubPoller();
});
