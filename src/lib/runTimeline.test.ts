import { test, expect } from 'vitest';
import { buildRunTimeline } from './runTimeline';
import type { PipelineRunStep } from '@/types';

function step(partial: Partial<PipelineRunStep> & { seq: number }): PipelineRunStep {
	return {
		id: `s${partial.seq}`,
		run_id: 'r',
		node_id: `n${partial.seq}`,
		persona_id: `p${partial.seq}`,
		session_id: `sess${partial.seq}`,
		outcome: null,
		summary: null,
		status: 'completed',
		started_at: '2026-01-01',
		ended_at: null,
		...partial,
	};
}

test('ordonne les blocs par seq croissant', () => {
	const blocks = buildRunTimeline(
		[step({ seq: 2 }), step({ seq: 1 }), step({ seq: 3 })],
		{ current_node_id: null, status: 'completed' },
	);
	expect(blocks.map((b) => b.step.seq)).toEqual([1, 2, 3]);
});

test('un step running est actif seulement si le run tourne', () => {
	const steps = [step({ seq: 1, status: 'completed' }), step({ seq: 2, status: 'running' })];
	const running = buildRunTimeline(steps, { current_node_id: 'n2', status: 'running' });
	expect(running.map((b) => b.isActive)).toEqual([false, true]);

	const paused = buildRunTimeline(steps, { current_node_id: 'n2', status: 'paused' });
	expect(paused.every((b) => !b.isActive)).toBe(true);
});

test('aucun step actif quand tous terminés', () => {
	const blocks = buildRunTimeline(
		[step({ seq: 1 }), step({ seq: 2 })],
		{ current_node_id: null, status: 'completed' },
	);
	expect(blocks.every((b) => !b.isActive)).toBe(true);
});
