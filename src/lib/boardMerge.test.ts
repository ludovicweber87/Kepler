import { describe, it, expect } from 'vitest';
import { buildBoardIssues } from './boardMerge';
import type { GitHubIssue } from '@/types';

function issue(node_id: string, state: 'open' | 'closed'): GitHubIssue {
	return {
		id: 1, node_id, number: 1, title: 't', body: null, state,
		html_url: '', updated_at: '', created_at: '', closed_at: null,
		labels: [], assignee: null, assignees: [], user: { login: '', avatar_url: '' },
		repository_url: '', project_columns: [],
	} as GitHubIssue;
}

describe('buildBoardIssues', () => {
	it('garde uniquement les issues ouvertes', () => {
		const out = buildBoardIssues([issue('a', 'open'), issue('b', 'closed')]);
		expect(out.map((i) => i.node_id)).toEqual(['a']);
	});
	it('déduplique par node_id (garde la première)', () => {
		const out = buildBoardIssues([issue('a', 'open'), issue('a', 'open')]);
		expect(out).toHaveLength(1);
	});
	it('liste vide → vide', () => {
		expect(buildBoardIssues([])).toEqual([]);
	});
});
