import test from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realPath, trimTrailingSlash } from './realPath.js';

const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'kepler-agent-realpath-')));
const repo = join(root, 'Lab', 'repo');
mkdirSync(join(repo, '.worktrees', 'wip-foo'), { recursive: true });
const link = join(root, 'Documents-Lab');
symlinkSync(join(root, 'Lab'), link);

test.after(() => rmSync(root, { recursive: true, force: true }));

test('trimTrailingSlash retire les slashes finaux, garde la racine', () => {
	assert.equal(trimTrailingSlash('/a/b/'), '/a/b');
	assert.equal(trimTrailingSlash('/a/b///'), '/a/b');
	assert.equal(trimTrailingSlash('/a/b'), '/a/b');
	assert.equal(trimTrailingSlash('/'), '/');
});

test('realPath résout un cwd passant par un symlink', () => {
	assert.equal(realPath(join(link, 'repo')), repo);
});

test('realPath résout un worktree sous le symlink', () => {
	assert.equal(
		realPath(join(link, 'repo', '.worktrees', 'wip-foo')),
		join(repo, '.worktrees', 'wip-foo'),
	);
});

test('realPath ignore le slash final', () => {
	assert.equal(realPath(`${join(link, 'repo')}/`), repo);
});

test('realPath rend le chemin nettoyé si la cible n’existe pas', () => {
	assert.equal(realPath('/chemin/qui/n/existe/pas/'), '/chemin/qui/n/existe/pas');
});
