import { describe, it, expect } from 'vitest';
import {
	MODEL_ALIASES,
	MODEL_VERSIONS,
	MODELS,
	EFFORTS,
	MODEL_FAMILIES,
	normalizeEffort,
} from './models';

describe('models', () => {
	it('MODELS = alias + versions, sans doublon de value', () => {
		expect(MODELS).toEqual([...MODEL_ALIASES, ...MODEL_VERSIONS]);
		const values = MODELS.map((m) => m.value);
		expect(new Set(values).size).toBe(values.length);
	});

	it('expose les 3 alias et 11 versions pinnées', () => {
		expect(MODEL_ALIASES.map((m) => m.value)).toEqual(['opus', 'sonnet', 'haiku']);
		expect(MODEL_VERSIONS).toHaveLength(11);
		expect(MODEL_VERSIONS.map((m) => m.value)).toContain('claude-opus-5');
		expect(MODEL_VERSIONS.map((m) => m.value)).toContain('claude-opus-4-8');
		expect(MODEL_VERSIONS.map((m) => m.value)).toContain('claude-fable-5');
	});

	it('claude-opus-5 est dans la famille opus, en tête', () => {
		const opus = MODEL_FAMILIES.find((f) => f.id === 'opus');
		expect(opus?.versions[0]).toBe('claude-opus-5');
	});

	it('EFFORTS remplace max par ultracode', () => {
		expect(EFFORTS.map((e) => e.value)).toEqual(['low', 'medium', 'high', 'ultracode']);
	});

	it('normalizeEffort mappe legacy max → ultracode, sinon inchangé', () => {
		expect(normalizeEffort('max')).toBe('ultracode');
		expect(normalizeEffort('ultracode')).toBe('ultracode');
		expect(normalizeEffort('high')).toBe('high');
		expect(normalizeEffort('')).toBe('');
	});

	it('chaque entrée a une value et une key non vides', () => {
		for (const item of [...MODELS, ...EFFORTS]) {
			expect(item.value.length).toBeGreaterThan(0);
			expect(item.key.length).toBeGreaterThan(0);
		}
	});
});
