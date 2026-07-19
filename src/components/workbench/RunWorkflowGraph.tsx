'use client';

import { useMemo } from 'react';
import {
	ReactFlow,
	ReactFlowProvider,
	Background,
	Controls,
	type Node,
	type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PersonaFlowContext } from '@/components/personas/flow/PersonaFlowContext';
import { nodeTypes } from '@/components/personas/flow/nodes';
import type { Persona, PersonaGroup, PipelineRunStep } from '@/types';
import type { PipelineRunWithSteps } from '@/hooks/usePipelineRun';

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

interface Props {
	run: PipelineRunWithSteps;
	group: PersonaGroup;
	personasById: Map<string, Persona>;
	/** Node clicked → caller scrolls that persona block into the chat. */
	onNodeClick: (nodeId: string) => void;
}

/** Read-only pipeline graph: nodes light up as personas run/complete. */
export default function RunWorkflowGraph({ run, group, personasById, onNodeClick }: Props) {
	const steps = useMemo(() => run.steps ?? [], [run.steps]);

	const rfNodes = useMemo<Node[]>(
		() =>
			group.nodes.map((n) => {
				const status = nodeStatus(
					n.id,
					run.current_node_id ?? null,
					run.status ?? '',
					steps,
				);
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
			}),
		[group.nodes, run.current_node_id, run.status, steps],
	);

	const rfEdges = useMemo<Edge[]>(
		() =>
			(group.edges ?? []).map((e) => ({
				...e,
				animated: e.source === run.current_node_id,
			})),
		[group.edges, run.current_node_id],
	);

	return (
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
					onNodeClick={(_, node) => onNodeClick(node.id)}
				>
					<Background />
					<Controls showInteractive={false} />
				</ReactFlow>
			</PersonaFlowContext.Provider>
		</ReactFlowProvider>
	);
}
