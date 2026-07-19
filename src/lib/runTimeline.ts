import type { PipelineRun, PipelineRunStep } from '@/types';

export interface RunTimelineBlock {
	step: PipelineRunStep;
	/** The persona is working right now: attach a live WS. Otherwise render static. */
	isActive: boolean;
}

/**
 * Ordered persona blocks for the aggregated run chat. A block is "active" (live
 * WS) only while the run itself is running and that step is still running —
 * completed/paused steps replay their persisted transcript statically.
 */
export function buildRunTimeline(
	steps: PipelineRunStep[],
	run: Pick<PipelineRun, 'current_node_id' | 'status'>,
): RunTimelineBlock[] {
	const runLive = run.status === 'running';
	return [...steps]
		.sort((a, b) => a.seq - b.seq)
		.map((step) => ({
			step,
			isActive: runLive && step.status === 'running',
		}));
}
