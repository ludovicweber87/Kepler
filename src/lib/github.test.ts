import { describe, it, expect } from 'vitest';
import { extractMergedBranches, extractMergedPrs } from './github';

describe('extractMergedBranches', () => {
	it('ne garde que les PRs réellement mergées', () => {
		const prs = [
			{ merged_at: '2026-07-10T00:00:00Z', head: { ref: 'feat/a' } },
			{ merged_at: null, head: { ref: 'feat/b' } },
			{ merged_at: '2026-07-11T00:00:00Z', head: { ref: 'fix/c' } },
		];
		expect(extractMergedBranches(prs).sort()).toEqual(['feat/a', 'fix/c']);
	});

	it('déduplique les refs de branche', () => {
		const prs = [
			{ merged_at: '2026-07-10T00:00:00Z', head: { ref: 'feat/a' } },
			{ merged_at: '2026-07-12T00:00:00Z', head: { ref: 'feat/a' } },
		];
		expect(extractMergedBranches(prs)).toEqual(['feat/a']);
	});

	it('renvoie un tableau vide sans PR mergée', () => {
		expect(extractMergedBranches([{ merged_at: null, head: { ref: 'x' } }])).toEqual([]);
	});
});

describe('extractMergedPrs', () => {
	it('ne garde que les PRs mergées, avec number et html_url', () => {
		const prs = [
			{
				merged_at: '2026-07-10T00:00:00Z',
				number: 1,
				html_url: 'https://github.com/o/r/pull/1',
				head: { ref: 'feat/a' },
			},
			{
				merged_at: null,
				number: 2,
				html_url: 'https://github.com/o/r/pull/2',
				head: { ref: 'feat/b' },
			},
		];
		expect(extractMergedPrs(prs)).toEqual([
			{ ref: 'feat/a', number: 1, html_url: 'https://github.com/o/r/pull/1' },
		]);
	});

	it('conserve la première PR vue par branche (la plus récente en tri desc)', () => {
		const prs = [
			{
				merged_at: '2026-07-12T00:00:00Z',
				number: 9,
				html_url: 'https://github.com/o/r/pull/9',
				head: { ref: 'feat/a' },
			},
			{
				merged_at: '2026-07-10T00:00:00Z',
				number: 3,
				html_url: 'https://github.com/o/r/pull/3',
				head: { ref: 'feat/a' },
			},
		];
		expect(extractMergedPrs(prs)).toEqual([
			{ ref: 'feat/a', number: 9, html_url: 'https://github.com/o/r/pull/9' },
		]);
	});
});
