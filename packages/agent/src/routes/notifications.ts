import type { IncomingMessage, ServerResponse } from 'node:http';
import { notificationStore } from '../notifications/store.js';

export function handleNotificationsStream(req: IncomingMessage, res: ServerResponse): void {
	// The CORS origin header is already computed by setCors() in index.ts for
	// every request (including this one) before dispatch — reuse it here
	// instead of hardcoding an origin.
	const corsOrigin = res.getHeader('Access-Control-Allow-Origin');

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
		...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin } : {}),
	});
	res.write(': hello\n\n');

	const ping = setInterval(() => {
		try {
			res.write(': ping\n\n');
		} catch {
			/* closed */
		}
	}, 25_000);

	const off = notificationStore.subscribe(res);

	req.on('close', () => {
		clearInterval(ping);
		off();
	});
}
