/** Types d'images envoyées inline au modèle (les seuls que l'API Anthropic accepte). */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
/** Une image part en base64 dans le prompt : plafond bas, l'API la recompte en tokens. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Les autres fichiers sont écrits sur disque et lus par l'agent : plafond plus large. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Types devinés à partir de l'extension quand le navigateur laisse `file.type` vide
 * (fréquent pour les fichiers de code et de conf). C'est ce média-type qui dit à
 * l'agent quel genre de fichier il reçoit, alors on évite l'octet-stream fourre-tout.
 */
const MEDIA_BY_EXT: Record<string, string> = {
	md: 'text/markdown',
	markdown: 'text/markdown',
	txt: 'text/plain',
	log: 'text/plain',
	csv: 'text/csv',
	tsv: 'text/tab-separated-values',
	json: 'application/json',
	jsonl: 'application/jsonl',
	yml: 'application/yaml',
	yaml: 'application/yaml',
	toml: 'application/toml',
	xml: 'application/xml',
	html: 'text/html',
	css: 'text/css',
	js: 'text/javascript',
	mjs: 'text/javascript',
	cjs: 'text/javascript',
	jsx: 'text/javascript',
	ts: 'text/x-typescript',
	tsx: 'text/x-typescript',
	py: 'text/x-python',
	rb: 'text/x-ruby',
	go: 'text/x-go',
	rs: 'text/x-rust',
	java: 'text/x-java',
	kt: 'text/x-kotlin',
	swift: 'text/x-swift',
	php: 'text/x-php',
	sh: 'text/x-shellscript',
	sql: 'application/sql',
	env: 'text/plain',
	pdf: 'application/pdf',
	zip: 'application/zip',
};

export function isImageMediaType(mediaType: string): boolean {
	return ALLOWED_IMAGE_TYPES.includes(mediaType);
}

/** Extension en minuscules, sans le point. `''` si le nom n'en a pas. */
export function fileExtension(name: string): string {
	const i = name.lastIndexOf('.');
	return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
}

/**
 * Média-type retenu pour un fichier : celui du navigateur s'il en donne un, sinon
 * déduit de l'extension, sinon binaire opaque.
 */
export function mediaTypeForFile(file: { name: string; type: string }): string {
	if (file.type) return file.type;
	return MEDIA_BY_EXT[fileExtension(file.name)] ?? 'application/octet-stream';
}

/**
 * Valide une pièce jointe. Une image d'un format non supporté est refusée plutôt
 * que traitée en fichier joint : le modèle ne la verrait pas, et l'outil Read de
 * l'agent ne sait pas non plus l'ouvrir.
 */
export function validateAttachment(file: {
	name: string;
	type: string;
	size: number;
}): 'type' | 'size' | null {
	const mediaType = mediaTypeForFile(file);
	const isImage = mediaType.startsWith('image/');
	if (isImage && !isImageMediaType(mediaType)) return 'type';
	if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) return 'size';
	return null;
}

export function stripDataUrlPrefix(dataUrl: string): { mediaType: string; data: string } {
	const m = dataUrl.match(/^data:([^;,]*);base64,(.*)$/);
	if (!m) return { mediaType: 'application/octet-stream', data: '' };
	// `data:;base64,…` : le navigateur n'a pas su typer le fichier.
	return { mediaType: m[1] || 'application/octet-stream', data: m[2] };
}

export function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

/**
 * Étiquette courte du type, affichée sur la pastille de pièce jointe : l'extension
 * si le nom en porte une (c'est ce que l'utilisateur reconnaît), sinon le sous-type
 * du média-type.
 */
export function attachmentTypeLabel(name: string, mediaType: string): string {
	const ext = fileExtension(name);
	if (ext) return ext.toUpperCase();
	const subtype = mediaType.split('/')[1] ?? mediaType;
	return subtype.replace(/^x-/, '').toUpperCase();
}
