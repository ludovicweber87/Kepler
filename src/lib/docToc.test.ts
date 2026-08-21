import { describe, it, expect } from 'vitest';
import { slugify, extractToc } from './docToc';

describe('slugify', () => {
	it('lowercases and hyphenates', () => {
		expect(slugify('Hello World')).toBe('hello-world');
	});
	it('strips punctuation', () => {
		expect(slugify("Qu'est-ce que Kubernetes ?")).toBe('quest-ce-que-kubernetes');
	});
});

describe('extractToc', () => {
	it('extracts h1..h3 with depth', () => {
		const md = '# Titre\n\n## Section A\n\ntexte\n\n### Sous-section\n\n#### trop profond';
		expect(extractToc(md)).toEqual([
			{ depth: 1, text: 'Titre', slug: 'titre', line: 1 },
			{ depth: 2, text: 'Section A', slug: 'section-a', line: 3 },
			{ depth: 3, text: 'Sous-section', slug: 'sous-section', line: 7 },
		]);
	});

	it('ignores headings inside fenced code blocks', () => {
		const md = '# Réel\n\n```\n# pas un titre\n```\n\n## Vrai';
		expect(extractToc(md).map((e) => e.text)).toEqual(['Réel', 'Vrai']);
	});

	it('gives distinct slugs to repeated headings', () => {
		const md = '## Prérequis\n\n## Prérequis';
		expect(extractToc(md).map((e) => e.slug)).toEqual(['prrequis', 'prrequis-1']);
	});

	it('numbers lines so rendered headings can be anchored', () => {
		const md = 'intro\n\n## Section\n\ntexte';
		expect(extractToc(md)[0].line).toBe(3);
	});

	it('returns empty for content without headings', () => {
		expect(extractToc('juste du texte\nsur deux lignes')).toEqual([]);
	});
});
