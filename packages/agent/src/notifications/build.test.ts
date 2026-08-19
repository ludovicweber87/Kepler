import { describe, it, expect } from 'vitest';
import { priorityFor, sourceFor, buildDedupeKey, buildNotification } from './build.js';

describe('priorityFor', () => {
	it('marks blocking/failure types high', () => {
		expect(priorityFor('agent_blocked')).toBe('high');
		expect(priorityFor('agent_error')).toBe('high');
	});
	it('marks the rest normal', () => {
		expect(priorityFor('agent_done')).toBe('normal');
	});
});

describe('sourceFor', () => {
	it('maps type -> source', () => {
		expect(sourceFor('agent_done')).toBe('agent');
		expect(sourceFor('agent_blocked')).toBe('agent');
	});
});

describe('buildDedupeKey', () => {
	it('is stable and joins parts', () => {
		expect(buildDedupeKey('agent_done', ['s1', '3'])).toBe('agent_done:s1:3');
	});
});

describe('buildNotification', () => {
	it('normalizes into a NewNotification', () => {
		const n = buildNotification({
			type: 'agent_blocked',
			title: 'blocked',
			url: '/workbench?session=s1',
			entityRef: { kind: 'session', id: 's1' },
			payload: { agent: 'Kepler' },
			dedupeParts: ['s1', 'q1'],
		});
		expect(n.source).toBe('agent');
		expect(n.priority).toBe('high');
		expect(n.dedupe_key).toBe('agent_blocked:s1:q1');
		expect(n.body).toBe('');
		expect(n.entity_ref).toEqual({ kind: 'session', id: 's1' });
	});
});
