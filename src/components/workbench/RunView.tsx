'use client';

import { useMemo, useState } from 'react';
import {
	ReactFlow,
	ReactFlowProvider,
	Background,
	Controls,
	type Node,
	type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { useTranslations } from 'next-intl';
import { usePipelineRun } from '@/hooks/usePipelineRun';
import { usePersonaGroup } from '@/hooks/usePersonaGroups';
import { usePersonas } from '@/hooks/usePersonas';
import { PersonaFlowContext } from '@/components/personas/flow/PersonaFlowContext';
import { nodeTypes } from '@/components/personas/flow/nodes';
import AgentChatTab from '@/components/agents/AgentChatTab';
import type { Persona, PipelineRunStep } from '@/types';

const STATUS_COLOR: Record<string, string> = {
	running: '#7C5CFF',
	paused: '#F59E0B',
	done: '#22C55E',
	idle: 'transparent',
};

function nodeStatus(
	nodeId: string,
	currentNodeId: string | null,
	runStatus: string,
	steps: PipelineRunStep[],
): 'running' | 'paused' | 'done' | 'idle' {
	if (nodeId === currentNodeId) {
		if (runStatus === 'paused') return 'paused';
		if (runStatus === 'running') return 'running';
	}
	if (steps.some((s) => s.node_id === nodeId && s.status === 'completed')) return 'done';
	return 'idle';
}

export default function RunView({ runId }: { runId: string }) {
	const t = useTranslations('personas');
	const { run, continueRun, stopRun } = usePipelineRun(runId);
	const { data: group } = usePersonaGroup(run?.group_id);
	const { personas } = usePersonas();
	const [selectedSession, setSelectedSession] = useState<string | null>(null);

	const personasById = useMemo(() => {
		const m = new Map<string, Persona>();
		for (const p of personas) m.set(p.id, p);
		return m;
	}, [personas]);

	const steps = useMemo(() => run?.steps ?? [], [run?.steps]);
	const stepByNode = useMemo(() => {
		const m = new Map<string, PipelineRunStep>();
		for (const s of steps) m.set(s.node_id, s); // last wins (seq asc)
		return m;
	}, [steps]);

	const rfNodes = useMemo<Node[]>(() => {
		if (!group) return [];
		return group.nodes.map((n) => {
			const status = nodeStatus(n.id, run?.current_node_id ?? null, run?.status ?? '', steps);
			const color = STATUS_COLOR[status];
			return {
				id: n.id,
				type: n.type,
				position: n.position,
				data: n.data,
				draggable: false,
				connectable: false,
				style:
					status === 'idle'
						? undefined
						: { boxShadow: `0 0 0 2px ${color}`, borderRadius: 8 },
			};
		});
	}, [group, run?.current_node_id, run?.status, steps]);

	const rfEdges = useMemo<Edge[]>(
		() =>
			(group?.edges ?? []).map((e) => ({
				...e,
				animated: e.source === run?.current_node_id,
			})),
		[group, run?.current_node_id],
	);

	if (!run || !group) {
		return null;
	}

	const cwd = run.worktree_path ?? run.project_path ?? null;

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<Stack
				direction="row"
				alignItems="center"
				spacing={1.5}
				sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
			>
				<Typography fontWeight={700} noWrap>
					{run.group_name}
				</Typography>
				{run.branch && <Chip size="small" label={run.branch} variant="outlined" />}
				<Chip
					size="small"
					label={run.status}
					color={
						run.status === 'running'
							? 'primary'
							: run.status === 'paused'
								? 'warning'
								: run.status === 'completed'
									? 'success'
									: 'default'
					}
				/>
				<Box sx={{ flex: 1 }} />
				{run.status === 'paused' && (
					<Button
						size="small"
						variant="contained"
						startIcon={<PlayArrowRoundedIcon />}
						onClick={() => continueRun.mutate()}
						sx={{ textTransform: 'none' }}
					>
						{t('runContinue')}
					</Button>
				)}
				{(run.status === 'running' || run.status === 'paused') && (
					<IconButton size="small" onClick={() => stopRun.mutate()}>
						<StopRoundedIcon />
					</IconButton>
				)}
			</Stack>

			<Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
				<Box sx={{ flex: selectedSession ? 1.2 : 1, minWidth: 0 }}>
					<ReactFlowProvider>
						<PersonaFlowContext.Provider value={personasById}>
							<ReactFlow
								nodes={rfNodes}
								edges={rfEdges}
								nodeTypes={nodeTypes}
								fitView
								nodesDraggable={false}
								nodesConnectable={false}
								proOptions={{ hideAttribution: true }}
								onNodeClick={(_, node) => {
									const step = stepByNode.get(node.id);
									if (step?.session_id) setSelectedSession(step.session_id);
								}}
							>
								<Background />
								<Controls showInteractive={false} />
							</ReactFlow>
						</PersonaFlowContext.Provider>
					</ReactFlowProvider>
				</Box>

				{selectedSession && (
					<Box
						sx={{
							width: '45%',
							minWidth: 380,
							borderLeft: '1px solid',
							borderColor: 'divider',
							display: 'flex',
							flexDirection: 'column',
						}}
					>
						<Stack
							direction="row"
							alignItems="center"
							justifyContent="flex-end"
							sx={{ px: 1, py: 0.5 }}
						>
							<IconButton size="small" onClick={() => setSelectedSession(null)}>
								<CloseRoundedIcon fontSize="small" />
							</IconButton>
						</Stack>
						<Box sx={{ flex: 1, minHeight: 0 }}>
							<AgentChatTab
								key={selectedSession}
								sessionId={selectedSession}
								cwd={cwd}
								readOnly
							/>
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
}
