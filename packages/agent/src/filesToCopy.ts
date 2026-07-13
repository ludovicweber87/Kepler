export function parseFilesToCopy(text: string): string[] {
	return (text ?? '')
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
}
