import { describe, it, expect } from 'vitest';
import { languageFromPath, FALLBACK_LANGUAGE, SHIKI_LANGUAGES } from './languageFromPath';

describe('languageFromPath', () => {
	it('mappe les extensions du projet', () => {
		expect(languageFromPath('src/lib/a.ts')).toBe('typescript');
		expect(languageFromPath('src/components/A.tsx')).toBe('tsx');
		expect(languageFromPath('scripts/dev.mjs')).toBe('javascript');
		expect(languageFromPath('package.json')).toBe('json');
		expect(languageFromPath('README.md')).toBe('markdown');
		expect(languageFromPath('style.css')).toBe('css');
		expect(languageFromPath('deploy.sh')).toBe('shellscript');
		expect(languageFromPath('ci.yml')).toBe('yaml');
	});

	it('est insensible a la casse de l extension', () => {
		expect(languageFromPath('A.TS')).toBe('typescript');
	});

	it('ne regarde que le dernier segment du chemin', () => {
		expect(languageFromPath('a.ts/b.json')).toBe('json');
	});

	it('mappe les fichiers reconnus par leur nom complet', () => {
		expect(languageFromPath('Dockerfile')).toBe('dockerfile');
		expect(languageFromPath('Makefile')).toBe('make');
		expect(languageFromPath('.gitignore')).toBe('ini');
	});

	it('mappe un nom complet suffixe', () => {
		expect(languageFromPath('.env.local')).toBe('ini');
		expect(languageFromPath('Dockerfile.dev')).toBe('dockerfile');
	});

	it('utilise la derniere extension d un nom a plusieurs points', () => {
		expect(languageFromPath('.eslintrc.json')).toBe('json');
		expect(languageFromPath('vitest.config.ts')).toBe('typescript');
	});

	it('retombe sur le fallback pour une extension inconnue', () => {
		expect(languageFromPath('archive.bin')).toBe(FALLBACK_LANGUAGE);
	});

	it('retombe sur le fallback sans extension', () => {
		expect(languageFromPath('LICENSE')).toBe(FALLBACK_LANGUAGE);
		expect(languageFromPath('')).toBe(FALLBACK_LANGUAGE);
	});
});

describe('SHIKI_LANGUAGES', () => {
	it('ne contient pas de doublon', () => {
		expect(new Set(SHIKI_LANGUAGES).size).toBe(SHIKI_LANGUAGES.length);
	});

	it('n inclut pas le fallback, que shiki traite comme un langage special', () => {
		expect(SHIKI_LANGUAGES).not.toContain(FALLBACK_LANGUAGE);
	});

	it('couvre toutes les valeurs que languageFromPath peut renvoyer', () => {
		for (const path of ['a.ts', 'a.tsx', 'a.json', 'Dockerfile', 'Makefile', '.gitignore']) {
			expect(SHIKI_LANGUAGES).toContain(languageFromPath(path));
		}
	});
});
