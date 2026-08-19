/** Extensions acceptées à l'import. */
const MD_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'];

/** Un fichier importable ? On se fie à l'extension : le type MIME des .md est erratique. */
export function isMarkdownFile(fileName: string): boolean {
	const lower = fileName.toLowerCase();
	return MD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** `guide-archi.md` → `guide-archi`. Sert de titre de repli. */
export function stripMarkdownExtension(fileName: string): string {
	const lower = fileName.toLowerCase();
	const ext = MD_EXTENSIONS.find((e) => lower.endsWith(e));
	return ext ? fileName.slice(0, -ext.length) : fileName;
}

/**
 * Titre d'une doc importée : le premier `# h1` du fichier, sinon le nom du
 * fichier sans extension. Les titres à l'intérieur d'un bloc ``` sont ignorés
 * (même règle que le sommaire, sinon un extrait de code shell ferait le titre).
 */
export function titleFromMarkdown(content: string, fileName: string): string {
	let inFence = false;
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		if (line.startsWith('```')) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^#\s+(.+)$/.exec(line);
		if (m) {
			const title = m[1].trim();
			if (title) return title;
		}
	}
	return stripMarkdownExtension(fileName).trim() || fileName;
}
