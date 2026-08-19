/**
 * Deterministic, client-safe slug for branch and display names.
 * Output is restricted to [a-z0-9-] so it satisfies the agent branch-name
 * validation regex /^[\w./-]+$/ (packages/agent/src/routes/git.ts).
 */
export function slugify(text: string, maxLen = 40): string {
	const slug = text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '') // strip diacritics (combining marks)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → hyphen
		.replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
	if (slug.length <= maxLen) return slug;
	return slug.slice(0, maxLen).replace(/-+$/g, '');
}
