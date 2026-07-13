import { describe, it, expect } from 'vitest';
import { buildBoardIssues, mergeConnectedBoards } from './boardMerge';
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

describe('mergeConnectedBoards', () => {
	const mk = (node: string, col: string): GitHubIssue =>
		({ ...issue(node, 'open'), project_columns: [{ project: 'p', column: col }] }) as GitHubIssue;

	it('union des statusColumns dans l’ordre des configs, dédupliquée', () => {
		const { statusColumns } = mergeConnectedBoards([
			{ config: { org: 'o', projectNumber: 1, statusColumns: ['Todo', 'Done'] }, boardIssues: [] },
			{ config: { org: 'o', projectNumber: 2, statusColumns: ['Todo', 'QA'] }, boardIssues: [] },
		]);
		expect(statusColumns).toEqual(['Todo', 'Done', 'QA']);
	});

	it('tague chaque issue avec sa config et dédup cross-board par node_id', () => {
		const { issues } = mergeConnectedBoards([
			{ config: { org: 'o', projectNumber: 1, statusColumns: [] }, boardIssues: [mk('a', 'Todo')] },
			{ config: { org: 'o', projectNumber: 2, statusColumns: [] }, boardIssues: [mk('a', 'Todo'), mk('b', 'QA')] },
		]);
		expect(issues.map((i) => i.node_id).sort()).toEqual(['a', 'b']);
		expect(issues.find((i) => i.node_id === 'a')!.__config.projectNumber).toBe(1);
	});
});
