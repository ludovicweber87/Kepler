import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
	it('lowercases and hyphenates words', () => {
		expect(slugify('Add User Login')).toBe('add-user-login');
	});
	it('strips accents', () => {
		expect(slugify('Réparer la connexion')).toBe('reparer-la-connexion');
	});
	it('collapses punctuation and multiple spaces', () => {
		expect(slugify('Fix:  crash!! (urgent)')).toBe('fix-crash-urgent');
	});
	it('trims leading/trailing separators', () => {
		expect(slugify('  --hello--  ')).toBe('hello');
	});
	it('truncates to maxLen without a trailing hyphen', () => {
		const out = slugify(`${'a'.repeat(30)} ${'b'.repeat(30)}`, 40);
		expect(out.length).toBeLessThanOrEqual(40);
		expect(out.endsWith('-')).toBe(false);
	});
	it('returns empty string for empty or symbol-only input', () => {
		expect(slugify('')).toBe('');
		expect(slugify('!!!')).toBe('');
	});
	it('only produces valid branch characters [a-z0-9-]', () => {
		expect(/^[a-z0-9-]*$/.test(slugify('Ünïcödé 🚀 Title #42'))).toBe(true);
	});
});
