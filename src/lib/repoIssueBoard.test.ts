import { describe, it, expect } from 'vitest';
import { resolveConfigForRepo, reconcileRepoIssues } from './repoIssueBoard';
import type { GitHubIssue, ProjectColumn } from '@/types';

function issue(node_id: string): GitHubIssue {
	return {
		id: 1,
		node_id,
		number: 1,
		title: 't',
		body: null,
		state: 'open',
		html_url: '',
		updated_at: '',
		created_at: '',
		closed_at: null,
		labels: [],
		assignee: null,
		assignees: [],
		user: { login: '', avatar_url: '' },
		repository_url: '',
		repo_full_name: 'o/r',
	} as GitHubIssue;
}

const cfg = {
	org: 'o',
	projectNumber: 5,
	ownerType: 'organization' as const,
	projectTitle: 'My Project',
	statusColumns: ['Todo', 'Done'],
};

describe('resolveConfigForRepo', () => {
	const configs = [
		{ id: 'a', viewRepoMappings: [{ repos: ['x/y'] }] },
		{ id: 'b', viewRepoMappings: [{ repos: ['O/R', 'p/q'] }] },
	];
	it('retourne la première config dont un mapping contient le repo (insensible à la casse)', () => {
		expect(resolveConfigForRepo('o/r', configs)?.id).toBe('b');
	});
	it('retourne null si aucun mapping ne couvre le repo', () => {
		expect(resolveConfigForRepo('none/here', configs)).toBeNull();
	});
	it('tolère les mappings vides / repos absents', () => {
		expect(resolveConfigForRepo('o/r', [{ viewRepoMappings: [{}] }])).toBeNull();
	});
});

describe('reconcileRepoIssues', () => {
	it('range une issue sur la colonne du Project couvrant et attache __config', () => {
		const cols = new Map<string, ProjectColumn[]>([
			['n1', [{ project: 'My Project', column: 'Done' }]],
		]);
		const { issues, statusColumns } = reconcileRepoIssues([issue('n1')], cols, cfg);
		expect(issues[0].project_columns).toEqual([{ project: 'My Project', column: 'Done' }]);
		expect(issues[0].__config).toEqual({ org: 'o', projectNumber: 5, ownerType: 'organization' });
		expect(statusColumns).toEqual(['Todo', 'Done']);
	});
	it('ignore les colonnes provenant d\'un autre Project que la config couvrante', () => {
		const cols = new Map<string, ProjectColumn[]>([
			['n1', [{ project: 'Other', column: 'QA' }]],
		]);
		const { issues } = reconcileRepoIssues([issue('n1')], cols, cfg);
		expect(issues[0].project_columns).toEqual([]);
		expect(issues[0].__config).toBeUndefined();
	});
	it('sans config couvrante → No Status, pas de __config, statusColumns vide', () => {
		const cols = new Map<string, ProjectColumn[]>([
			['n1', [{ project: 'Whatever', column: 'Done' }]],
		]);
		const { issues, statusColumns } = reconcileRepoIssues([issue('n1')], cols, null);
		expect(issues[0].project_columns).toEqual([]);
		expect(issues[0].__config).toBeUndefined();
		expect(statusColumns).toEqual([]);
	});
	it('issue sans entrée de colonne → project_columns vide', () => {
		const { issues } = reconcileRepoIssues([issue('n1')], new Map(), cfg);
		expect(issues[0].project_columns).toEqual([]);
	});
});
