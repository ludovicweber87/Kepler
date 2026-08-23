import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveDbPath } from '../dbPath.js';

/** Pièce jointe reçue du client : image inline ou fichier quelconque. */
export type ChatAttachmentInput = { name: string; mediaType: string; data: string };

/** Pièce jointe écrite sur disque, telle que référencée dans le transcript. */
export type SavedAttachment = { name: string; url: string; mediaType: string; path: string };

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
	pdf: 'application/pdf',
	txt: 'text/plain',
	md: 'text/markdown',
	csv: 'text/csv',
	json: 'application/json',
	zip: 'application/zip',
};

export function extForMediaType(mediaType: string): string | null {
	return EXT[mediaType] ?? null;
}

/** Une image que l'API sait rendre → envoyée inline. Tout le reste part sur disque. */
export function isImageMediaType(mediaType: string): boolean {
	return extForMediaType(mediaType) !== null;
}

export function sanitizeSegment(s: string): string {
	return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Nom de fichier attendu : `<uuid>-<nom-assaini>`, tel qu'écrit par `saveAttachment`.
 *
 * Volontairement une validation et non un `sanitizeSegment` : celui-ci écrase le
 * point de l'extension (`abc.png` → `abc_png`), donc aucune pièce jointe n'était
 * jamais retrouvée sur disque — toutes les images du chat tombaient en 404.
 * Le motif interdit `/`, le point en tête ou en queue et `..` : pas de traversée
 * possible. L'extension, elle, n'est plus dans une liste blanche depuis que le
 * composer accepte tout type de fichier ; c'est le `Content-Type` du service (par
 * défaut `application/octet-stream`, + `nosniff`) qui empêche l'exécution.
 */
const SAFE_FILE = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;

export function isSafeAttachmentFile(file: string): boolean {
	return SAFE_FILE.test(file);
}

/**
 * Nom de fichier sûr : garde le point (donc l'extension, qui porte le type lu par
 * l'agent), écarte séparateurs, points en tête ou en queue et suites de points.
 * `sanitizeSegment` ne convient pas ici, il écraserait le `.` de `photo.png`.
 * Invariant : le résultat passe toujours `isSafeAttachmentFile`.
 */
export function sanitizeFileName(s: string): string {
	const cleaned = s
		.replace(/[^a-zA-Z0-9._-]/g, '_')
		.replace(/\.{2,}/g, '.')
		.replace(/^\.|\.$/g, '');
	return cleaned === '' ? 'fichier' : cleaned;
}

/** Raccourcit un nom trop long sans lui manger son extension. */
export function truncateFileName(name: string, max: number): string {
	if (name.length <= max) return name;
	const dot = name.lastIndexOf('.');
	const ext = dot > 0 ? name.slice(dot) : '';
	return `${name.slice(0, Math.max(1, max - ext.length))}${ext}`;
}

export function attachmentRelUrl(sessionId: string, file: string): string {
	return `/attachments/${sanitizeSegment(sessionId)}/${file}`;
}

export function attachmentsDir(): string {
	return join(dirname(resolveDbPath()), 'attachments');
}

/**
 * Nom sur disque : uuid + nom d'origine assaini. L'uuid évite les collisions, le nom
 * d'origine rend le chemin lisible pour l'agent (« uuid-rapport-q3.pdf » lui dit déjà
 * de quoi il s'agit avant même de l'ouvrir).
 */
export function diskFileName(mediaType: string, name: string): string {
	const safe = sanitizeFileName(name);
	const imageExt = extForMediaType(mediaType);
	// Image sans extension exploitable (collée depuis le presse-papiers) : on la donne.
	const withExt =
		imageExt && !safe.toLowerCase().endsWith(`.${imageExt}`) ? `${safe}.${imageExt}` : safe;
	// Re-assaini après coupe : tronquer peut laisser un point en queue (« a.bcdef.pdf »
	// → « a..pdf »), et le nom doit rester accepté par `isSafeAttachmentFile`.
	return `${randomUUID()}-${sanitizeFileName(truncateFileName(withExt, 60))}`;
}

export function saveAttachment(
	sessionId: string,
	mediaType: string,
	base64: string,
	name = 'fichier',
): { url: string; path: string } {
	const dir = join(attachmentsDir(), sanitizeSegment(sessionId));
	mkdirSync(dir, { recursive: true });
	const file = diskFileName(mediaType, name);
	const full = join(dir, file);
	writeFileSync(full, Buffer.from(base64, 'base64'));
	return { url: attachmentRelUrl(sessionId, file), path: full };
}

/**
 * Marqueur listant les fichiers joints au tour courant. Les images partent inline
 * (le modèle les voit) ; les autres fichiers ne sont que sur disque, donc il faut
 * leur chemin et leur type pour que l'agent sache quoi ouvrir, et avec quel outil.
 */
export function buildAttachmentsNote(files: SavedAttachment[]): string | undefined {
	if (files.length === 0) return undefined;
	const list = files.map((f) => `- ${f.name} (${f.mediaType}) : ${f.path}`).join('\n');
	const intro =
		files.length === 1
			? `L'utilisateur a joint 1 fichier à ce message.`
			: `L'utilisateur a joint ${files.length} fichiers à ce message.`;
	return (
		`<system-reminder>${intro} Ils sont enregistrés sur disque, hors du dépôt : ` +
		`ouvre-les avec Read (chemins absolus ci-dessous) si leur contenu compte pour la demande.\n${list}\n` +
		`</system-reminder>`
	);
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
		file = decodeURIComponent(parts[2]);
	} catch {
		res.writeHead(404);
		res.end();
		return;
	}
	if (!isSafeAttachmentFile(file)) {
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
	res.writeHead(200, {
		'Content-Type': EXT_TO_MEDIA[ext.toLowerCase()] ?? 'application/octet-stream',
		// Le dossier contient maintenant des fichiers utilisateurs de tout type : pas de
		// reniflage, sinon un .txt rempli de HTML serait servi comme une page.
		'X-Content-Type-Options': 'nosniff',
	});
	res.end(readFileSync(full));
}
