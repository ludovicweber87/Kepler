import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
};
const EXT_TO_MEDIA: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
};

export function extForMediaType(mediaType: string): string | null {
	return EXT[mediaType] ?? null;
}

export function sanitizeSegment(s: string): string {
	return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function attachmentRelUrl(sessionId: string, file: string): string {
	return `/attachments/${sanitizeSegment(sessionId)}/${file}`;
}

export function attachmentsDir(): string {
	const dbPath =
		process.env.DEVORA_DB_PATH ??
		fileURLToPath(new URL('../../../../data/devora.db', import.meta.url));
	return join(dirname(dbPath), 'attachments');
}

export function saveAttachment(
	sessionId: string,
	mediaType: string,
	base64: string,
): { url: string } | null {
	const ext = extForMediaType(mediaType);
	if (!ext) return null;
	const dir = join(attachmentsDir(), sanitizeSegment(sessionId));
	mkdirSync(dir, { recursive: true });
	const file = `${randomUUID()}.${ext}`;
	writeFileSync(join(dir, file), Buffer.from(base64, 'base64'));
	return { url: attachmentRelUrl(sessionId, file) };
}

// GET /attachments/<session>/<file>
export function serveAttachment(_req: IncomingMessage, res: ServerResponse, path: string): void {
	const parts = path.split('/').filter(Boolean); // ['attachments', session, file]
	if (parts.length !== 3) {
		res.writeHead(404);
		res.end();
		return;
	}
	let session: string;
	let file: string;
	try {
		session = sanitizeSegment(decodeURIComponent(parts[1]));
		file = sanitizeSegment(decodeURIComponent(parts[2]));
	} catch {
		res.writeHead(404);
		res.end();
		return;
	}
	const full = normalize(join(attachmentsDir(), session, file));
	if (!full.startsWith(attachmentsDir()) || !existsSync(full)) {
		res.writeHead(404);
		res.end();
		return;
	}
	const ext = file.split('.').pop() ?? '';
	res.writeHead(200, { 'Content-Type': EXT_TO_MEDIA[ext] ?? 'application/octet-stream' });
	res.end(readFileSync(full));
}
