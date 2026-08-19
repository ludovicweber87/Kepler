export interface TocEntry {
	depth: number;
	text: string;
	slug: string;
}

/** Transforme un titre en ancre URL simple (minuscules, tirets). */
export function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');
}

/** Extrait le sommaire (h1→h3) d'un contenu Markdown. Fonction pure. */
export function extractToc(md: string): TocEntry[] {
	const entries: TocEntry[] = [];
	let inFence = false;
	for (const rawLine of md.split('\n')) {
		const line = rawLine.trim();
		// Ignore les titres à l'intérieur des blocs de code ```.
		if (line.startsWith('```')) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^(#{1,3})\s+(.*)$/.exec(line);
		if (m) entries.push({ depth: m[1].length, text: m[2].trim(), slug: slugify(m[2].trim()) });
	}
	return entries;
}
