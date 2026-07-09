import { describe, it, expect } from 'vitest';
import { resolveEffectivePath } from './effectivePath';

describe('resolveEffectivePath', () => {
	it('current-branch mode → projectPath', () => {
		expect(resolveEffectivePath({ launchMode: 'current-branch', projectPath: '/repo' })).toBe(
			'/repo',
		);
	});

	it('explicit worktreePath wins over session', () => {
		expect(
			resolveEffectivePath({
				worktreePath: '/repo/.worktrees/feat-x',
				projectPath: '/repo',
				session: { worktree_path: '/other' },
			}),
		).toBe('/repo/.worktrees/feat-x');
	});

	it('falls back to session.worktree_path', () => {
		expect(
			resolveEffectivePath({
				projectPath: '/repo',
				session: { worktree_path: '/repo/.worktrees/wt' },
			}),
		).toBe('/repo/.worktrees/wt');
	});

	it('no worktree_path → falls back to projectPath (no branch derivation)', () => {
		expect(
			resolveEffectivePath({ projectPath: '/repo', session: { branch: 'feat/foo' } }),
		).toBe('/repo');
	});

	it('main branch → projectPath (no derivation)', () => {
		expect(resolveEffectivePath({ projectPath: '/repo', session: { branch: 'main' } })).toBe(
			'/repo',
		);
	});

	it('uses existingWorktreePath before bare projectPath', () => {
		expect(
			resolveEffectivePath({
				projectPath: '/repo',
				existingWorktreePath: '/repo/.worktrees/ew',
			}),
		).toBe('/repo/.worktrees/ew');
	});

	it('null projectPath and nothing else → null', () => {
		expect(resolveEffectivePath({})).toBeNull();
	});
});
