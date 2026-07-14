import { describe, it, expect } from 'vitest';
import { extractMergedBranches } from './github';

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
