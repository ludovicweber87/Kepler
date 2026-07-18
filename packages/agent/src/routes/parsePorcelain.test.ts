import { describe, it, expect } from 'vitest';
import { parsePorcelain } from './parsePorcelain.js';

describe('parsePorcelain', () => {
	it('reports clean tree for empty output', () => {
		expect(parsePorcelain('')).toEqual({ dirty: false, count: 0 });
		expect(parsePorcelain('\n')).toEqual({ dirty: false, count: 0 });
	});

	it('counts each changed file line', () => {
		const out = ' M src/a.ts\n?? src/b.ts\nA  src/c.ts\n';
		expect(parsePorcelain(out)).toEqual({ dirty: true, count: 3 });
	});

	it('ignores trailing/blank lines', () => {
		expect(parsePorcelain(' M only.ts\n\n')).toEqual({ dirty: true, count: 1 });
	});
});
