/** Helpers purs pour le rendu d'un tool call dans le chat (nom + chip). */

const FILE_KEYS = ['file_path', 'path', 'notebook_path'] as const;
const FALLBACK_KEYS = ['command', 'pattern', 'url', 'query', 'prompt'] as const;

function asRecord(input: unknown): Record<string, unknown> | null {
	return input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
}

/** Chemin de fichier ciblé par le tool (file_path/path/notebook_path), ou null. */
export function extractFilePath(input: unknown): string | null {
	const inp = asRecord(input);
	if (!inp) return null;
	for (const k of FILE_KEYS) {
		const v = inp[k];
		if (typeof v === 'string' && v.trim()) return v;
	}
	return null;
}

/** Nom de fichier seul (dernier segment du chemin). */
export function basename(path: string): string {
	const clean = path.replace(/\/+$/, '');
	const idx = clean.lastIndexOf('/');
	return idx === -1 ? clean : clean.slice(idx + 1);
}

/** Raccourcit un nom de tool MCP `mcp__server__tool` en `tool`. */
export function prettyToolName(name: string): string {
	if (name.startsWith('mcp__')) {
		const parts = name.split('__').filter(Boolean);
		return parts[parts.length - 1] ?? name;
	}
	return name;
}

/** Libellé du chip : basename si fichier, sinon commande/pattern/url tronquée. */
export function toolChipLabel(input: unknown): string {
	const file = extractFilePath(input);
	if (file) return basename(file);
	const inp = asRecord(input);
	if (!inp) return '';
	for (const k of FALLBACK_KEYS) {
		const v = inp[k];
		if (typeof v === 'string' && v.trim()) return v;
	}
	return '';
}

/**
 * Clé i18n (namespace `agentChat`) décrivant l'action d'un outil de doc, ou null.
 * On renvoie une CLÉ et pas un libellé : ce module est pur et ne traduit pas —
 * c'est ChatToolCard qui appelle useTranslations.
 */
const DOC_TOOL_LABEL_KEYS: Record<string, string> = {
	mcp__doc__read_doc: 'docRead',
	mcp__doc__edit_doc: 'docUpdated',
	mcp__doc__replace_doc: 'docUpdated',
};

export function docToolLabelKey(name: string): string | null {
	return DOC_TOOL_LABEL_KEYS[name] ?? null;
}
