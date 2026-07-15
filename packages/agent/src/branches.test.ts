import { test } from 'node:test';
import assert from 'node:assert';
import { dedupeAndSortBranches, worktreeAddArgs } from './branches.js';

const mk = (name: string, date: string) => ({
	name,
	lastCommitDate: date,
	lastCommitMessage: 'msg',
	lastCommitAuthor: 'me',
});

test('dédupe: une branche locale masque son homologue distante', () => {
	const out = dedupeAndSortBranches({
		local: [mk('feat/x', '2026-07-10T10:00:00+00:00')],
		remote: [mk('feat/x', '2026-07-10T10:00:00+00:00')],
		current: 'main',
		checkedOut: [],
	});
	const x = out.filter((b) => b.name === 'feat/x');
	assert.equal(x.length, 1);
	assert.equal(x[0].isRemote, false);
});

test('branche distante seule est marquée isRemote', () => {
	const out = dedupeAndSortBranches({
		local: [],
		remote: [mk('feat/only-remote', '2026-07-10T10:00:00+00:00')],
		current: 'main',
		checkedOut: [],
	});
	assert.equal(out[0].name, 'feat/only-remote');
	assert.equal(out[0].isRemote, true);
});

test('marque isCurrent et isCheckedOut', () => {
	const out = dedupeAndSortBranches({
		local: [mk('main', '2026-07-10T10:00:00+00:00'), mk('feat/y', '2026-07-09T10:00:00+00:00')],
		remote: [],
		current: 'main',
		checkedOut: ['feat/y'],
	});
	const main = out.find((b) => b.name === 'main')!;
	const y = out.find((b) => b.name === 'feat/y')!;
	assert.equal(main.isCurrent, true);
	assert.equal(y.isCheckedOut, true);
	assert.equal(main.isCheckedOut, false);
});

test('trie par date de commit décroissante', () => {
	const out = dedupeAndSortBranches({
		local: [mk('old', '2026-01-01T00:00:00+00:00'), mk('new', '2026-07-01T00:00:00+00:00')],
		remote: [],
		current: 'x',
		checkedOut: [],
	});
	assert.deepEqual(
		out.map((b) => b.name),
		['new', 'old'],
	);
});

test('worktreeAddArgs: mode worktree crée une nouvelle branche depuis la base', () => {
	assert.deepEqual(
		worktreeAddArgs({
			worktreePath: '/wt/feat-x',
			branch: 'feat/x',
			mode: 'worktree',
			isRemote: false,
			base: 'origin/main',
		}),
		['/wt/feat-x', '-b', 'feat/x', 'origin/main'],
	);
});

test('worktreeAddArgs: existing-branch locale checkout direct', () => {
	assert.deepEqual(
		worktreeAddArgs({
			worktreePath: '/wt/feat-x',
			branch: 'feat/x',
			mode: 'existing-branch',
			isRemote: false,
			base: '',
		}),
		['/wt/feat-x', 'feat/x'],
	);
});

test('worktreeAddArgs: existing-branch distante crée une branche de tracking', () => {
	assert.deepEqual(
		worktreeAddArgs({
			worktreePath: '/wt/feat-x',
			branch: 'feat/x',
			mode: 'existing-branch',
			isRemote: true,
			base: '',
		}),
		['--track', '-b', 'feat/x', '/wt/feat-x', 'origin/feat/x'],
	);
});
