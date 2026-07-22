import { describe, it, expect } from 'vitest';
import { MODEL_ALIASES, MODEL_VERSIONS, MODELS, EFFORTS } from './models';

describe('models', () => {
	it('MODELS = alias + versions, sans doublon de value', () => {
		expect(MODELS).toEqual([...MODEL_ALIASES, ...MODEL_VERSIONS]);
		const values = MODELS.map((m) => m.value);
		expect(new Set(values).size).toBe(values.length);
	});

	it('expose les 3 alias et 10 versions pinnées', () => {
		expect(MODEL_ALIASES.map((m) => m.value)).toEqual(['opus', 'sonnet', 'haiku']);
		expect(MODEL_VERSIONS).toHaveLength(10);
		expect(MODEL_VERSIONS.map((m) => m.value)).toContain('claude-opus-4-8');
		expect(MODEL_VERSIONS.map((m) => m.value)).toContain('claude-fable-5');
	});

	it('EFFORTS inclut max', () => {
		expect(EFFORTS.map((e) => e.value)).toEqual(['low', 'medium', 'high', 'max']);
	});

	it('chaque entrée a une value et une key non vides', () => {
		for (const item of [...MODELS, ...EFFORTS]) {
			expect(item.value.length).toBeGreaterThan(0);
			expect(item.key.length).toBeGreaterThan(0);
		}
	});
});
