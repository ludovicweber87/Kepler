import { describe, it, expect } from 'vitest';
import { resolveStoredCollapsed } from './useSidebarCollapsed';

describe('resolveStoredCollapsed', () => {
	it('defaults to expanded when nothing is stored', () => {
		expect(resolveStoredCollapsed(null)).toBe(false);
	});

	it('reads the two persisted states', () => {
		expect(resolveStoredCollapsed('true')).toBe(true);
		expect(resolveStoredCollapsed('false')).toBe(false);
	});

	it('falls back to expanded on garbage', () => {
		expect(resolveStoredCollapsed('')).toBe(false);
		expect(resolveStoredCollapsed('1')).toBe(false);
		expect(resolveStoredCollapsed('TRUE')).toBe(false);
	});
});
