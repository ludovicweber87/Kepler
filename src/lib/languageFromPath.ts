/** Identifiants de langage shiki, par extension de fichier. */
const BY_EXTENSION: Record<string, string> = {
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'jsx',
	json: 'json',
	jsonc: 'jsonc',
	css: 'css',
	scss: 'scss',
	html: 'html',
	xml: 'xml',
	svg: 'xml',
	md: 'markdown',
	mdx: 'markdown',
	sh: 'shellscript',
	bash: 'shellscript',
	zsh: 'shellscript',
	yml: 'yaml',
	yaml: 'yaml',
	toml: 'toml',
	ini: 'ini',
	sql: 'sql',
	py: 'python',
	go: 'go',
	rs: 'rust',
	java: 'java',
	rb: 'ruby',
	php: 'php',
	graphql: 'graphql',
	gql: 'graphql',
	prisma: 'prisma',
	vue: 'vue',
	diff: 'diff',
	patch: 'diff',
};

/** Fichiers reconnus par leur nom complet : aucune extension sur laquelle s'appuyer. */
const BY_FILENAME: Record<string, string> = {
	dockerfile: 'dockerfile',
	makefile: 'make',
	'.gitignore': 'ini',
	'.dockerignore': 'ini',
	'.prettierignore': 'ini',
	'.npmrc': 'ini',
	'.env': 'ini',
};

/** Langage spécial de shiki : aucune grammaire à charger, rendu sans couleur. */
export const FALLBACK_LANGUAGE = 'text';

/** Grammaires à charger dans createHighlighter, dédupliquées. */
export const SHIKI_LANGUAGES: string[] = [
	...new Set([...Object.values(BY_EXTENSION), ...Object.values(BY_FILENAME)]),
];

/** Déduit l'identifiant de langage shiki d'un chemin de fichier. */
export function languageFromPath(path: string): string {
	const name = (path.split('/').pop() ?? '').toLowerCase();
	if (!name) return FALLBACK_LANGUAGE;

	const exact = BY_FILENAME[name];
	if (exact) return exact;

	const dot = name.lastIndexOf('.');
	// dot <= 0 : soit pas d'extension, soit un dotfile déjà traité par BY_FILENAME.
	if (dot > 0) {
		const byExt = BY_EXTENSION[name.slice(dot + 1)];
		if (byExt) return byExt;
	}

	// Noms complets suffixés : `.env.local`, `Dockerfile.dev`.
	for (const [key, lang] of Object.entries(BY_FILENAME)) {
		if (name.startsWith(`${key}.`)) return lang;
	}

	return FALLBACK_LANGUAGE;
}
