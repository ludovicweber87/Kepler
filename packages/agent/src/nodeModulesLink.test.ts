import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, lstatSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPnpmManaged, linkNodeModules } from './nodeModulesLink.js';

function makeRepo(pkg: Record<string, unknown> = { name: 'r' }): { root: string; wt: string } {
	const root = mkdtempSync(join(tmpdir(), 'kepler-nm-'));
	writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
	mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
	const wt = mkdtempSync(join(tmpdir(), 'kepler-nm-wt-'));
	return { root, wt };
}

test('isPnpmManaged : détecte lockfile, workspace file et packageManager', () => {
	const a = makeRepo();
	assert.equal(isPnpmManaged(a.root), false);
	writeFileSync(join(a.root, 'pnpm-lock.yaml'), '');
	assert.equal(isPnpmManaged(a.root), true);

	const b = makeRepo();
	writeFileSync(join(b.root, 'pnpm-workspace.yaml'), 'packages: []');
	assert.equal(isPnpmManaged(b.root), true);

	const c = makeRepo({ name: 'r', packageManager: 'pnpm@11.5.1' });
	assert.equal(isPnpmManaged(c.root), true);

	const d = makeRepo({ name: 'r', packageManager: 'npm@10.0.0' });
	assert.equal(isPnpmManaged(d.root), false);
});

test('isPnpmManaged : package.json absent ou illisible → false', () => {
	const root = mkdtempSync(join(tmpdir(), 'kepler-nm-empty-'));
	assert.equal(isPnpmManaged(root), false);
	writeFileSync(join(root, 'package.json'), '{ not json');
	assert.equal(isPnpmManaged(root), false);
});

test('repo npm → node_modules symlinké dans le worktree', () => {
	const { root, wt } = makeRepo();
	linkNodeModules(root, wt);
	assert.ok(lstatSync(join(wt, 'node_modules')).isSymbolicLink());
	assert.ok(existsSync(join(wt, 'node_modules', 'pkg')));
});

test('repo pnpm → pas de symlink (sinon l’install du worktree pollue le repo principal)', () => {
	const { root, wt } = makeRepo();
	writeFileSync(join(root, 'pnpm-lock.yaml'), '');
	linkNodeModules(root, wt);
	assert.equal(existsSync(join(wt, 'node_modules')), false);
});

test('node_modules créé par pnpm sans lockfile committé → pas de symlink', () => {
	const { root, wt } = makeRepo();
	writeFileSync(join(root, 'node_modules', '.modules.yaml'), 'layoutVersion: 5\n');
	assert.equal(isPnpmManaged(root), true);
	linkNodeModules(root, wt);
	assert.equal(existsSync(join(wt, 'node_modules')), false);
});

test('node_modules déjà présent dans le worktree → intact', () => {
	const { root, wt } = makeRepo();
	mkdirSync(join(wt, 'node_modules', 'local'), { recursive: true });
	linkNodeModules(root, wt);
	assert.equal(lstatSync(join(wt, 'node_modules')).isSymbolicLink(), false);
	assert.ok(existsSync(join(wt, 'node_modules', 'local')));
});

test('node_modules absent du repo principal → pas de symlink cassé', () => {
	const root = mkdtempSync(join(tmpdir(), 'kepler-nm-nonm-'));
	writeFileSync(join(root, 'package.json'), '{"name":"r"}');
	const wt = mkdtempSync(join(tmpdir(), 'kepler-nm-wt2-'));
	linkNodeModules(root, wt);
	assert.equal(existsSync(join(wt, 'node_modules')), false);
});
