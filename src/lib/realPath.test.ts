import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realPath, realPathOrNull, trimTrailingSlash } from './realPath';

let root = '';
let target = '';
let link = '';

beforeAll(() => {
	root = realpathSync.native(mkdtempSync(join(tmpdir(), 'kepler-realpath-')));
	target = join(root, 'Lab', 'repo');
	mkdirSync(target, { recursive: true });
	link = join(root, 'Documents-Lab');
	symlinkSync(join(root, 'Lab'), link);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('trimTrailingSlash', () => {
	it('retire les slashes finaux', () => {
		expect(trimTrailingSlash('/a/b/')).toBe('/a/b');
		expect(trimTrailingSlash('/a/b///')).toBe('/a/b');
		expect(trimTrailingSlash('/a/b')).toBe('/a/b');
	});

	it('laisse la racine intacte', () => {
		expect(trimTrailingSlash('/')).toBe('/');
	});
});

describe('realPath', () => {
	it('résout un chemin passant par un symlink', () => {
		expect(realPath(join(link, 'repo'))).toBe(target);
	});

	it('résout aussi les worktrees sous le symlink', () => {
		const wt = join(target, '.worktrees', 'wip-foo');
		mkdirSync(wt, { recursive: true });
		expect(realPath(join(link, 'repo', '.worktrees', 'wip-foo'))).toBe(wt);
	});

	it('ignore le slash final', () => {
		expect(realPath(`${join(link, 'repo')}/`)).toBe(target);
	});

	it('rend le chemin nettoyé si la cible n’existe pas', () => {
		expect(realPath('/chemin/qui/n/existe/pas/')).toBe('/chemin/qui/n/existe/pas');
	});
});

describe('realPathOrNull', () => {
	it('rend null pour vide, absent ou blanc', () => {
		expect(realPathOrNull(null)).toBeNull();
		expect(realPathOrNull(undefined)).toBeNull();
		expect(realPathOrNull('   ')).toBeNull();
	});

	it('normalise comme realPath sinon', () => {
		expect(realPathOrNull(join(link, 'repo'))).toBe(target);
	});
});
