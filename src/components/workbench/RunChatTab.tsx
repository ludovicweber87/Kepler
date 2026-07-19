'use client';

import { useEffect, useMemo, useReducer, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { Persona } from '@/types';
import type { PipelineRunWithSteps } from '@/hooks/usePipelineRun';
import { usePersonas } from '@/hooks/usePersonas';
import { buildRunTimeline } from '@/lib/runTimeline';
import PersonaTurnBadge from '@/components/agents/chat/PersonaTurnBadge';
import StaticStepChat from './StaticStepChat';
import LiveStepChat from './LiveStepChat';

const FALLBACK_COLOR = '#7C5CFF';

interface Props {
	run: PipelineRunWithSteps;
	cwd: string | null;
	/** When set, scrolls the matching persona block into view (node click). */
	focusNodeId?: string | null;
}

export default function RunChatTab({ run, cwd, focusNodeId }: Props) {
	const t = useTranslations('workbench');
	const { personas } = usePersonas();
	const scrollRef = useRef<HTMLDivElement>(null);
	const [, bumpActivity] = useReducer((x) => x + 1, 0);

	const personasById = useMemo(() => {
		const m = new Map<string, Persona>();
		for (const p of personas) m.set(p.id, p);
		return m;
	}, [personas]);

	const blocks = useMemo(() => buildRunTimeline(run.steps, run), [run]);

	// Follow the bottom while the live step streams, but only if the user is
	// already near it (never yank them up from scrollback).
	const activeCount = blocks.filter((b) => b.isActive).length;
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
		if (nearBottom) el.scrollTop = el.scrollHeight;
	}, [activeCount, blocks.length]);

	// Node click in the Workflow tab → scroll that persona's block into view.
	useEffect(() => {
		if (!focusNodeId) return;
		const el = scrollRef.current?.querySelector(`[data-step-node="${focusNodeId}"]`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, [focusNodeId]);

	if (blocks.length === 0) {
		return (
			<Box sx={{ p: 3 }}>
				<Typography variant="body2" color="text.secondary">
					{t('runChatEmpty')}
				</Typography>
			</Box>
		);
	}

	return (
		<Box
			ref={scrollRef}
			sx={{ height: '100%', overflowY: 'auto', py: 1, bgcolor: 'background.default' }}
		>
			{blocks.map(({ step, isActive }) => {
				const persona = step.persona_id ? personasById.get(step.persona_id) : null;
				return (
					<Box key={step.id} data-step-node={step.node_id}>
						<PersonaTurnBadge
							name={persona?.name ?? t('runChatPersonaFallback')}
							color={persona?.color ?? FALLBACK_COLOR}
						/>
						{isActive && step.session_id ? (
							<LiveStepChat
								key={step.session_id}
								sessionId={step.session_id}
								cwd={cwd}
								onActivity={bumpActivity}
							/>
						) : step.session_id ? (
							<StaticStepChat sessionId={step.session_id} />
						) : null}
					</Box>
				);
			})}
		</Box>
	);
}
