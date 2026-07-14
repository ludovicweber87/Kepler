/* ── Types ── */
export interface FileDiff {
	path: string;
	oldPath?: string;
	additions: number;
	deletions: number;
	hunks: Hunk[];
}

export interface Hunk {
	header: string;
	lines: DiffLine[];
}

export interface DiffLine {
	type: 'add' | 'del' | 'ctx';
	content: string;
	oldLineNo?: number;
	newLineNo?: number;
}

/** A paired row for side-by-side display */
export interface SideBySideRow {
	left: { lineNo?: number; content: string; type: 'del' | 'ctx' | 'empty' };
	right: { lineNo?: number; content: string; type: 'add' | 'ctx' | 'empty' };
}

/* ── Parser ── */
export function parseDiff(raw: string): FileDiff[] {
	if (!raw.trim()) return [];

	const files: FileDiff[] = [];
	const fileParts = raw.split(/^diff --git /m).filter(Boolean);

	for (const part of fileParts) {
		const lines = part.split('\n');
		const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
		if (!headerMatch) continue;

		const oldPath = headerMatch[1];
		const newPath = headerMatch[2];

		const file: FileDiff = {
			path: newPath,
			oldPath: oldPath !== newPath ? oldPath : undefined,
			additions: 0,
			deletions: 0,
			hunks: [],
		};

		let currentHunk: Hunk | null = null;
		let oldLine = 0;
		let newLine = 0;

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i];
			const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
			if (hunkMatch) {
				oldLine = parseInt(hunkMatch[1], 10);
				newLine = parseInt(hunkMatch[2], 10);
				currentHunk = { header: line, lines: [] };
				file.hunks.push(currentHunk);
				continue;
			}
			if (!currentHunk) continue;
			if (line.startsWith('\\')) continue;

			if (line.startsWith('+')) {
				currentHunk.lines.push({
					type: 'add',
					content: line.slice(1),
					newLineNo: newLine++,
				});
				file.additions++;
			} else if (line.startsWith('-')) {
				currentHunk.lines.push({
					type: 'del',
					content: line.slice(1),
					oldLineNo: oldLine++,
				});
				file.deletions++;
			} else if (line.length > 0 || (currentHunk.lines.length > 0 && line === '')) {
				currentHunk.lines.push({
					type: 'ctx',
					content: line.startsWith(' ') ? line.slice(1) : line,
					oldLineNo: oldLine++,
					newLineNo: newLine++,
				});
			}
		}
		files.push(file);
	}
	return files;
}

/* ── Build side-by-side rows from hunk lines ── */
export function buildSideBySideRows(lines: DiffLine[]): SideBySideRow[] {
	const rows: SideBySideRow[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (line.type === 'ctx') {
			rows.push({
				left: { lineNo: line.oldLineNo, content: line.content, type: 'ctx' },
				right: { lineNo: line.newLineNo, content: line.content, type: 'ctx' },
			});
			i++;
		} else if (line.type === 'del') {
			// Collect consecutive del lines, then pair with following add lines
			const dels: DiffLine[] = [];
			while (i < lines.length && lines[i].type === 'del') {
				dels.push(lines[i]);
				i++;
			}
			const adds: DiffLine[] = [];
			while (i < lines.length && lines[i].type === 'add') {
				adds.push(lines[i]);
				i++;
			}

			const maxLen = Math.max(dels.length, adds.length);
			for (let j = 0; j < maxLen; j++) {
				const del = dels[j];
				const add = adds[j];
				rows.push({
					left: del
						? { lineNo: del.oldLineNo, content: del.content, type: 'del' }
						: { content: '', type: 'empty' },
					right: add
						? { lineNo: add.newLineNo, content: add.content, type: 'add' }
						: { content: '', type: 'empty' },
				});
			}
		} else if (line.type === 'add') {
			// Standalone add (no preceding del)
			rows.push({
				left: { content: '', type: 'empty' },
				right: { lineNo: line.newLineNo, content: line.content, type: 'add' },
			});
			i++;
		}
	}

	return rows;
}
