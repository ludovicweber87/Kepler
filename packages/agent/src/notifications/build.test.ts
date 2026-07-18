import { describe, it, expect } from 'vitest';
import { priorityFor, sourceFor, buildDedupeKey, buildNotification } from './build.js';

describe('priorityFor', () => {
	it('marks blocking/failure types high', () => {
		expect(priorityFor('agent_blocked')).toBe('high');
		expect(priorityFor('agent_error')).toBe('high');
		expect(priorityFor('ci_failed')).toBe('high');
		expect(priorityFor('changes_requested')).toBe('high');
	});
	it('marks the rest normal', () => {
		expect(priorityFor('agent_done')).toBe('normal');
		expect(priorityFor('pr_merged')).toBe('normal');
	});
});

describe('sourceFor', () => {
	it('maps type -> source', () => {
		expect(sourceFor('agent_done')).toBe('agent');
		expect(sourceFor('ci_failed')).toBe('ci');
		expect(sourceFor('mention')).toBe('github');
		expect(sourceFor('pr_merged')).toBe('pr');
	});
});

describe('buildDedupeKey', () => {
	it('is stable and joins parts', () => {
		expect(buildDedupeKey('ci_failed', ['owner/repo#42', 'abc123'])).toBe('ci_failed:owner/repo#42:abc123');
	});
});

describe('buildNotification', () => {
	it('normalizes into a NewNotification', () => {
		const n = buildNotification({
			type: 'agent_blocked',
			title: 'blocked',
			url: '/workbench?session=s1',
			entityRef: { kind: 'session', id: 's1' },
			payload: { agent: 'Devora' },
			dedupeParts: ['s1', 'q1'],
		});
		expect(n.source).toBe('agent');
		expect(n.priority).toBe('high');
		expect(n.dedupe_key).toBe('agent_blocked:s1:q1');
		expect(n.body).toBe('');
		expect(n.entity_ref).toEqual({ kind: 'session', id: 's1' });
	});
});
