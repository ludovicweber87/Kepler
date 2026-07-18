// Pure graph-traversal logic for pipeline runs.
// No I/O, no SDK — deterministic and unit-testable (node:test).

export type FlowNodeType = 'start' | 'persona' | 'checkpoint' | 'end';

export interface FlowNodeData {
	personaId?: string;
	outputs?: string[];
	endAction?: 'none' | 'create-pr';
	[key: string]: unknown;
}

export interface FlowNode {
	id: string;
	type: FlowNodeType;
	data?: FlowNodeData;
}

export interface FlowEdge {
	id: string;
	source: string;
	target: string;
	sourceHandle?: string | null;
}

/** Default output name used when a persona node declares no explicit outputs. */
export const DEFAULT_OUTPUT = 'done';

export function findStartNode(nodes: FlowNode[]): FlowNode | undefined {
	return nodes.find((n) => n.type === 'start');
}

export function getNode(nodes: FlowNode[], id: string): FlowNode | undefined {
	return nodes.find((n) => n.id === id);
}

export function outgoingEdges(edges: FlowEdge[], nodeId: string): FlowEdge[] {
	return edges.filter((e) => e.source === nodeId);
}

export function isTerminal(node: FlowNode): boolean {
	return node.type === 'end';
}

/** Declared outputs of a persona node (falls back to [DEFAULT_OUTPUT]). */
export function nodeOutputs(node: FlowNode): string[] {
	const outs = node.data?.outputs?.filter((o) => o.trim().length > 0);
	return outs && outs.length > 0 ? outs : [DEFAULT_OUTPUT];
}

export interface ResolveResult {
	node: FlowNode;
	edge: FlowEdge;
}

/**
 * Resolve the next node to visit from `currentId`.
 *
 * - `outcome` is the output name an agent declared (persona nodes with branches).
 *   When omitted (start/checkpoint passthrough), a single outgoing edge is taken;
 *   multiple edges without an outcome is ambiguous → returns null.
 * - When `outcome` is given, the edge whose `sourceHandle` matches it is followed
 *   (a null handle is treated as DEFAULT_OUTPUT).
 *
 * Returns null on dead-ends (no matching edge or dangling target).
 */
export function resolveNext(
	nodes: FlowNode[],
	edges: FlowEdge[],
	currentId: string,
	outcome?: string | null,
): ResolveResult | null {
	const outs = outgoingEdges(edges, currentId);
	if (outs.length === 0) return null;

	let edge: FlowEdge | undefined;
	if (outcome != null) {
		edge = outs.find((e) => (e.sourceHandle ?? DEFAULT_OUTPUT) === outcome);
	} else {
		edge = outs.length === 1 ? outs[0] : undefined;
	}
	if (!edge) return null;

	const node = getNode(nodes, edge.target);
	return node ? { node, edge } : null;
}

export interface GraphValidation {
	ok: boolean;
	errors: string[];
}

/** Structural checks used before starting a run. */
export function validateGraph(nodes: FlowNode[], edges: FlowEdge[]): GraphValidation {
	const errors: string[] = [];
	const starts = nodes.filter((n) => n.type === 'start');
	if (starts.length !== 1) errors.push('graph must have exactly one start node');

	for (const n of nodes) {
		if (n.type === 'persona' && !n.data?.personaId) {
			errors.push(`persona node ${n.id} has no persona assigned`);
		}
		if (n.type === 'persona') {
			const declared = nodeOutputs(n);
			const handles = new Set(
				outgoingEdges(edges, n.id).map((e) => e.sourceHandle ?? DEFAULT_OUTPUT),
			);
			for (const out of declared) {
				if (!handles.has(out)) {
					errors.push(`persona node ${n.id} output "${out}" is not connected`);
				}
			}
		}
	}

	const ids = new Set(nodes.map((n) => n.id));
	for (const e of edges) {
		if (!ids.has(e.source) || !ids.has(e.target)) {
			errors.push(`edge ${e.id} references a missing node`);
		}
	}

	return { ok: errors.length === 0, errors };
}
