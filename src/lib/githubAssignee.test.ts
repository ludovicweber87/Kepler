import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();

vi.mock('@/db', () => ({
	db: {
		select: () => ({ from: () => ({ where: () => ({ get: getMock }) }) }),
	},
}));
vi.mock('@/db/schema', () => ({ appSettings: { key: 'key', value: 'value' } }));
vi.mock('drizzle-orm', () => ({ eq: () => undefined }));

import { resolveAssigneeLogin } from './githubAssignee';

describe('resolveAssigneeLogin', () => {
	beforeEach(() => getMock.mockReset());

	it('renvoie la valeur configurée quand elle est non vide', () => {
		getMock.mockReturnValue({ value: 'octocat' });
		expect(resolveAssigneeLogin('fallback')).toBe('octocat');
	});

	it('retombe sur le fallback quand la valeur est vide', () => {
		getMock.mockReturnValue({ value: '' });
		expect(resolveAssigneeLogin('fallback')).toBe('fallback');
	});

	it('retombe sur le fallback quand aucune ligne', () => {
		getMock.mockReturnValue(undefined);
		expect(resolveAssigneeLogin('fallback')).toBe('fallback');
	});

	it('trim la valeur configurée', () => {
		getMock.mockReturnValue({ value: '  octocat  ' });
		expect(resolveAssigneeLogin('fallback')).toBe('octocat');
	});

	it('retombe sur le fallback quand la valeur est seulement des espaces', () => {
		getMock.mockReturnValue({ value: '   ' });
		expect(resolveAssigneeLogin('fallback')).toBe('fallback');
	});
});
