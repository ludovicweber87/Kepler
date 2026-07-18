import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	findStartNode,
	resolveNext,
	validateGraph,
	nodeOutputs,
	isTerminal,
	type FlowNode,
	type FlowEdge,
} from './pipelineGraph.js';

// start → dev(persona, done) → review(persona, approved|changes_requested)
//   approved → end
//   changes_requested → dev (loop back)
const nodes: FlowNode[] = [
	{ id: 'start', type: 'start' },
	{ id: 'dev', type: 'persona', data: { personaId: 'p1', outputs: ['done'] } },
	{
		id: 'review',
		type: 'persona',
		data: { personaId: 'p2', outputs: ['approved', 'changes_requested'] },
	},
	{ id: 'end', type: 'end', data: { endAction: 'create-pr' } },
];
const edges: FlowEdge[] = [
	{ id: 'e1', source: 'start', target: 'dev', sourceHandle: null },
	{ id: 'e2', source: 'dev', target: 'review', sourceHandle: 'done' },
	{ id: 'e3', source: 'review', target: 'end', sourceHandle: 'approved' },
	{ id: 'e4', source: 'review', target: 'dev', sourceHandle: 'changes_requested' },
];

test('findStartNode returns the unique start', () => {
	assert.equal(findStartNode(nodes)?.id, 'start');
});

test('start passthrough (no outcome) follows its single edge', () => {
	assert.equal(resolveNext(nodes, edges, 'start')?.node.id, 'dev');
});

test('persona single-output resolves by matching handle "done"', () => {
	assert.equal(resolveNext(nodes, edges, 'dev', 'done')?.node.id, 'review');
});

test('branch: approved → end, changes_requested → dev (loop)', () => {
	assert.equal(resolveNext(nodes, edges, 'review', 'approved')?.node.id, 'end');
	assert.equal(resolveNext(nodes, edges, 'review', 'changes_requested')?.node.id, 'dev');
});

test('unknown outcome is a dead-end (null)', () => {
	assert.equal(resolveNext(nodes, edges, 'review', 'nope'), null);
});

test('multiple outgoing edges without an outcome is ambiguous (null)', () => {
	assert.equal(resolveNext(nodes, edges, 'review'), null);
});

test('terminal node has no outgoing edge', () => {
	assert.equal(resolveNext(nodes, edges, 'end'), null);
	assert.equal(isTerminal(nodes.find((n) => n.id === 'end')!), true);
});

test('nodeOutputs falls back to ["done"]', () => {
	assert.deepEqual(nodeOutputs({ id: 'x', type: 'persona' }), ['done']);
	assert.deepEqual(nodeOutputs({ id: 'x', type: 'persona', data: { outputs: [] } }), ['done']);
});

test('validateGraph accepts the sample graph', () => {
	assert.equal(validateGraph(nodes, edges).ok, true);
});

test('validateGraph flags missing start', () => {
	const res = validateGraph(
		nodes.filter((n) => n.type !== 'start'),
		edges,
	);
	assert.equal(res.ok, false);
	assert.ok(res.errors.some((e) => e.includes('start')));
});

test('validateGraph flags unconnected persona output', () => {
	const res = validateGraph(nodes, edges.filter((e) => e.id !== 'e4'));
	assert.equal(res.ok, false);
	assert.ok(res.errors.some((e) => e.includes('changes_requested')));
});

test('validateGraph flags persona without personaId', () => {
	const bad: FlowNode[] = [
		{ id: 'start', type: 'start' },
		{ id: 'p', type: 'persona', data: { outputs: ['done'] } },
	];
	const res = validateGraph(bad, [{ id: 'e', source: 'start', target: 'p', sourceHandle: null }]);
	assert.equal(res.ok, false);
	assert.ok(res.errors.some((e) => e.includes('no persona assigned')));
});
