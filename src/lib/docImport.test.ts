import { describe, it, expect } from 'vitest';
import { isMarkdownFile, stripMarkdownExtension, titleFromMarkdown } from './docImport';

describe('isMarkdownFile', () => {
	it('accepts the markdown extensions, whatever the case', () => {
		expect(isMarkdownFile('guide.md')).toBe(true);
		expect(isMarkdownFile('GUIDE.MD')).toBe(true);
		expect(isMarkdownFile('notes.markdown')).toBe(true);
	});

	it('rejects anything else', () => {
		expect(isMarkdownFile('archi.pdf')).toBe(false);
		expect(isMarkdownFile('README')).toBe(false);
		expect(isMarkdownFile('md')).toBe(false);
	});
});

describe('stripMarkdownExtension', () => {
	it('drops the extension only', () => {
		expect(stripMarkdownExtension('guide-archi.md')).toBe('guide-archi');
		expect(stripMarkdownExtension('v1.2.markdown')).toBe('v1.2');
	});

	it('leaves a name without a known extension untouched', () => {
		expect(stripMarkdownExtension('README')).toBe('README');
	});
});

describe('titleFromMarkdown', () => {
	it('takes the first h1', () => {
		expect(titleFromMarkdown('# Architecture\n\ntexte', 'notes.md')).toBe('Architecture');
	});

	it('ignores h2+ and picks the first h1 further down', () => {
		expect(titleFromMarkdown('## Intro\n\n# Le vrai titre\n', 'notes.md')).toBe(
			'Le vrai titre',
		);
	});

	it('ignores the headings inside a code fence', () => {
		const md = '```sh\n# npm install\n```\n\n# Titre réel\n';
		expect(titleFromMarkdown(md, 'notes.md')).toBe('Titre réel');
	});

	it('falls back to the file name without extension', () => {
		expect(titleFromMarkdown('juste du texte', 'guide-archi.md')).toBe('guide-archi');
		expect(titleFromMarkdown('```\n# dans un bloc\n```', 'notes.md')).toBe('notes');
	});

	it('falls back too when the h1 is empty', () => {
		expect(titleFromMarkdown('#\n\ntexte', 'notes.md')).toBe('notes');
	});

	it('keeps the raw name when stripping leaves nothing', () => {
		expect(titleFromMarkdown('texte', '.md')).toBe('.md');
	});
});
