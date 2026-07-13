import { describe, it, expect } from 'vitest';
import { resolveRepoFullName } from './resolveRepoFullName';

const paths = [{ repo_full_name: 'owner/repo', local_path: '/Users/me/repo' }];

describe('resolveRepoFullName', () => {
	it('prioritise issue_owner/issue_repo', () => {
		expect(
			resolveRepoFullName({ issue_owner: 'o', issue_repo: 'r', project_path: '/x' }, paths),
		).toBe('o/r');
	});
	it('reverse-lookup par project_path (insensible à la casse)', () => {
		expect(resolveRepoFullName({ project_path: '/users/me/REPO' }, paths)).toBe('owner/repo');
	});
	it('null si rien ne matche', () => {
		expect(resolveRepoFullName({ project_path: '/nope' }, paths)).toBeNull();
	});
	it('null si session null', () => {
		expect(resolveRepoFullName(null, paths)).toBeNull();
	});
});
