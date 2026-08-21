export interface TocEntry {
	depth: number;
	text: string;
	slug: string;
	/** Ligne (1-indexée) du titre dans le Markdown : sert à ancrer le titre rendu. */
	line: number;
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
	// Deux titres identiques donneraient la même ancre : on suffixe les doublons.
	const seen = new Map<string, number>();
	let inFence = false;
	md.split('\n').forEach((rawLine, i) => {
		const line = rawLine.trim();
		// Ignore les titres à l'intérieur des blocs de code ```.
		if (line.startsWith('```')) {
			inFence = !inFence;
			return;
		}
		if (inFence) return;
		const m = /^(#{1,3})\s+(.*)$/.exec(line);
		if (!m) return;
		const text = m[2].trim();
		const base = slugify(text);
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		entries.push({
			depth: m[1].length,
			text,
			slug: count === 0 ? base : `${base}-${count}`,
			line: i + 1,
		});
	});
	return entries;
}
