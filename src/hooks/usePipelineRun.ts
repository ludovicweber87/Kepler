import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';
import type { PipelineRun, PipelineRunStep } from '@/types';

export interface PipelineRunWithSteps extends PipelineRun {
	steps: PipelineRunStep[];
}

export function usePipelineRun(runId: string | undefined) {
	const qc = useQueryClient();

	const query = useQuery({
		queryKey: ['pipeline-run', runId],
		queryFn: async () => {
			const res = await localFetch(`/pipeline-runs/${encodeURIComponent(runId!)}`);
			if (!res.ok) throw new Error('Failed to fetch run');
			return (await res.json()) as PipelineRunWithSteps | null;
		},
		enabled: !!runId,
		refetchInterval: 2500,
	});

	const run = query.data ?? null;
	const isTerminal = run?.status === 'completed' || run?.status === 'failed';

	const action = (verb: 'continue' | 'stop') =>
		localFetch(`/pipeline-runs/${encodeURIComponent(runId!)}/${verb}`, { method: 'POST' });

	const cont = useMutation({
		mutationFn: () => action('continue'),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline-run', runId] }),
	});
	const stop = useMutation({
		mutationFn: () => action('stop'),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline-run', runId] }),
	});

	return {
		run,
		isLoading: query.isLoading,
		// Stop polling frequently once the run is finished.
		isTerminal,
		continueRun: cont,
		stopRun: stop,
	};
}
