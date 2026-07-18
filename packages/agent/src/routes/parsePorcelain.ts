/** Parse la sortie de `git status --porcelain` → présence et nombre de fichiers modifiés. */
export function parsePorcelain(output: string): { dirty: boolean; count: number } {
	const count = output.split('\n').filter((line) => line.trim().length > 0).length;
	return { dirty: count > 0, count };
}
