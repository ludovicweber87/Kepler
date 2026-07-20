import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getDb } from '../db.js';
import { sdkAgent } from '../terminal.js';
import { getLocalGithubToken } from '../helpers.js';
import { fetchIssueContextBlock } from '../issueContext.js';
import {
	findStartNode,
	getNode,
	resolveNext,
	nodeOutputs,
	type FlowNode,
	type FlowEdge,
} from './pipelineGraph.js';

const DIFF_LIMIT = 12000;
const DEFAULT_MAX_STEPS = 30;

interface StepOutcome {
	output?: string;
	summary?: string;
	awaiting?: boolean;
}

interface RunHandle {
	cancelled: boolean;
	currentSessionId: string | null;
}

const runs = new Map<string, RunHandle>();

// ── DB helpers (raw SQL; the agent process does not run migrations) ──

function readGroup(groupId: string): { nodes: FlowNode[]; edges: FlowEdge[]; name: string } | null {
	const d = getDb();
	if (!d) return null;
	const row = d
		.prepare('SELECT name, nodes, edges FROM persona_groups WHERE id = ?')
		.get(groupId) as { name: string; nodes: string | null; edges: string | null } | undefined;
	if (!row) return null;
	const parse = <T>(v: string | null): T[] => {
		if (!v) return [];
		try {
			return JSON.parse(v) as T[];
		} catch {
			return [];
		}
	};
	return {
		name: row.name,
		nodes: parse<FlowNode>(row.nodes),
		edges: parse<FlowEdge>(row.edges),
	};
}

interface PersonaRow {
	id: string;
	name: string;
	system_prompt: string | null;
	model: string | null;
	effort: string | null;
	permission_mode: string | null;
}

function readPersona(id: string): PersonaRow | null {
	const d = getDb();
	if (!d) return null;
	return (
		(d
			.prepare(
				'SELECT id, name, system_prompt, model, effort, permission_mode FROM personas WHERE id = ?',
			)
			.get(id) as PersonaRow | undefined) ?? null
	);
}

function setRun(runId: string, fields: Record<string, unknown>) {
	const d = getDb();
	if (!d) return;
	const keys = Object.keys(fields);
	if (keys.length === 0) return;
	const setClause = keys.map((k) => `${k} = ?`).join(', ');
	d.prepare(`UPDATE pipeline_runs SET ${setClause} WHERE id = ?`).run(
		...keys.map((k) => fields[k]),
		runId,
	);
}

function gitDiff(cwd: string): string {
	try {
		const staged = execSync('git --no-pager diff --staged', {
			cwd,
			encoding: 'utf-8',
			timeout: 10000,
			maxBuffer: 20 * 1024 * 1024,
		});
		const unstaged = execSync('git --no-pager diff', {
			cwd,
			encoding: 'utf-8',
			timeout: 10000,
			maxBuffer: 20 * 1024 * 1024,
		});
		const combined = [staged, unstaged].filter(Boolean).join('\n');
		return combined.length > DIFF_LIMIT
			? combined.slice(0, DIFF_LIMIT) + '\n… (diff tronqué)'
			: combined;
	} catch {
		return '';
	}
}

export interface StartRunParams {
	groupId: string;
	projectPath: string;
	projectName?: string;
	branch?: string;
	worktreePath: string;
	initialPrompt: string;
	issueOwner?: string | null;
	issueRepo?: string | null;
	issueNumber?: number | null;
	issueTitle?: string | null;
	maxSteps?: number;
}

/** Create the run row and kick off the traversal in the background. Returns the runId. */
export function startRun(params: StartRunParams): string {
	const d = getDb();
	if (!d) throw new Error('DB unavailable');
	const group = readGroup(params.groupId);
	if (!group) throw new Error('group not found');
	const start = findStartNode(group.nodes);
	if (!start) throw new Error('group has no start node');

	const runId = randomUUID();
	d.prepare(
		`INSERT INTO pipeline_runs
		 (id, group_id, group_name, project_path, project_name, branch, worktree_path,
		  status, current_node_id, initial_prompt, issue_owner, issue_repo, issue_number, issue_title, max_steps, step_count)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, 0)`,
	).run(
		runId,
		params.groupId,
		group.name,
		params.projectPath,
		params.projectName ?? '',
		params.branch ?? '',
		params.worktreePath,
		start.id,
		params.initialPrompt,
		params.issueOwner ?? null,
		params.issueRepo ?? null,
		params.issueNumber ?? null,
		params.issueTitle ?? null,
		params.maxSteps ?? DEFAULT_MAX_STEPS,
	);

	runs.set(runId, { cancelled: false, currentSessionId: null });
	void driveRun(runId).catch((err) => {
		console.error('[pipeline] run failed', runId, err);
		setRun(runId, { status: 'failed', pause_reason: 'error', ended_at: new Date().toISOString() });
	});
	return runId;
}

/** Resume a paused run: checkpoint → advance; error/awaiting → re-run current node. */
export function continueRun(runId: string): boolean {
	const d = getDb();
	if (!d) return false;
	const run = d.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as
		| Record<string, unknown>
		| undefined;
	if (!run || run.status !== 'paused') return false;
	runs.set(runId, { cancelled: false, currentSessionId: null });
	setRun(runId, { status: 'running', pause_reason: null });
	void driveRun(runId, String(run.pause_reason ?? '')).catch((err) => {
		console.error('[pipeline] resume failed', runId, err);
		setRun(runId, { status: 'failed', pause_reason: 'error', ended_at: new Date().toISOString() });
	});
	return true;
}

export function stopRun(runId: string): void {
	const handle = runs.get(runId);
	if (handle) {
		handle.cancelled = true;
		if (handle.currentSessionId) sdkAgent.stop(handle.currentSessionId);
	}
	setRun(runId, { status: 'failed', pause_reason: null, ended_at: new Date().toISOString() });
	runs.delete(runId);
}

async function driveRun(runId: string, resumeReason = ''): Promise<void> {
	const d = getDb();
	if (!d) return;
	const runRow = d.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as
		| Record<string, unknown>
		| undefined;
	if (!runRow) return;
	const group = readGroup(String(runRow.group_id));
	if (!group) throw new Error('group vanished');

	const handle = runs.get(runId) ?? { cancelled: false, currentSessionId: null };
	runs.set(runId, handle);

	const worktree = String(runRow.worktree_path);
	const initialPrompt = String(runRow.initial_prompt ?? '');
	// Parité avec le solo : injecter le contexte complet de l'issue (body + commentaires)
	// dans le system_prompt de chaque persona. Récupéré une seule fois par run.
	let issueContext = '';
	if (runRow.issue_owner && runRow.issue_repo && runRow.issue_number) {
		issueContext = await fetchIssueContextBlock(
			String(runRow.issue_owner),
			String(runRow.issue_repo),
			Number(runRow.issue_number),
			getLocalGithubToken(),
		);
	}
	const maxSteps = Number(runRow.max_steps ?? DEFAULT_MAX_STEPS);
	let stepCount = Number(runRow.step_count ?? 0);
	let lastSummary: string | null = null;
	let lastPersonaName: string | null = null;

	// Determine the node to start/resume from.
	let node: FlowNode | undefined = getNode(group.nodes, String(runRow.current_node_id));
	if (!node) node = findStartNode(group.nodes);
	if (!node) return;

	// On a checkpoint resume, step past the checkpoint to its single successor.
	if (resumeReason === 'checkpoint' && node.type === 'checkpoint') {
		const next = resolveNext(group.nodes, group.edges, node.id);
		if (!next) {
			setRun(runId, { status: 'failed', pause_reason: 'error', ended_at: new Date().toISOString() });
			return;
		}
		node = next.node;
	}
	// From the start node, advance to the first real node.
	if (node.type === 'start') {
		const next = resolveNext(group.nodes, group.edges, node.id);
		if (!next) {
			setRun(runId, { status: 'failed', pause_reason: 'error', ended_at: new Date().toISOString() });
			return;
		}
		node = next.node;
	}

	while (node && !handle.cancelled) {
		setRun(runId, { current_node_id: node.id });

		if (node.type === 'end') {
			await runEndAction(node, worktree);
			setRun(runId, { status: 'completed', pause_reason: null, ended_at: new Date().toISOString() });
			runs.delete(runId);
			return;
		}

		if (node.type === 'checkpoint') {
			setRun(runId, { status: 'paused', pause_reason: 'checkpoint' });
			return;
		}

		if (node.type === 'persona') {
			if (stepCount >= maxSteps) {
				setRun(runId, { status: 'paused', pause_reason: 'max_steps' });
				return;
			}
			const outcome = await runPersonaStep({
				runId,
				node,
				worktree,
				runRow,
				initialPrompt,
				handoffSummary: lastSummary,
				handoffFrom: lastPersonaName,
				issueContext,
				seq: stepCount,
				handle,
			});
			stepCount += 1;
			setRun(runId, { step_count: stepCount });

			if (handle.cancelled) return;
			if (outcome.awaiting) {
				setRun(runId, { status: 'paused', pause_reason: 'awaiting_outcome' });
				return;
			}
			lastSummary = outcome.summary ?? null;
			const persona = node.data?.personaId ? readPersona(node.data.personaId) : null;
			lastPersonaName = persona?.name ?? null;

			const next = resolveNext(group.nodes, group.edges, node.id, outcome.output);
			if (!next) {
				setRun(runId, { status: 'paused', pause_reason: 'error' });
				return;
			}
			node = next.node;
			continue;
		}

		// Unknown node type → stop safely.
		setRun(runId, { status: 'failed', pause_reason: 'error', ended_at: new Date().toISOString() });
		return;
	}
}

interface RunStepArgs {
	runId: string;
	node: FlowNode;
	worktree: string;
	runRow: Record<string, unknown>;
	initialPrompt: string;
	handoffSummary: string | null;
	handoffFrom: string | null;
	/** Contexte de l'issue (body + commentaires) à préfixer au system_prompt du persona. */
	issueContext: string;
	seq: number;
	handle: RunHandle;
}

async function runPersonaStep(args: RunStepArgs): Promise<StepOutcome> {
	const d = getDb();
	if (!d) return { awaiting: true };
	const { node, worktree, runId } = args;
	const persona = node.data?.personaId ? readPersona(node.data.personaId) : null;
	const outputs = nodeOutputs(node);

	const stepSessionId = `${runId}-${node.id}-${args.seq}`;
	const stepId = randomUUID();

	// Register a session row so the Workbench can drill into this step's chat.
	const personaBase = persona?.system_prompt ?? '';
	const withIssue = args.issueContext ? `${personaBase}\n\n${args.issueContext}`.trim() : personaBase;
	const systemPrompt = buildStepSystemPrompt(withIssue, outputs);
	d.prepare(
		`INSERT INTO agent_sessions
		 (id, session_id, project_path, project_name, branch, worktree_path, agent_name, status,
		  system_prompt, launch_mode, pipeline_run_id, pipeline_node_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 'pipeline', ?, ?)`,
	).run(
		randomUUID(),
		stepSessionId,
		String(args.runRow.project_path ?? ''),
		String(args.runRow.project_name ?? ''),
		String(args.runRow.branch ?? ''),
		worktree,
		persona?.name ?? 'Persona',
		systemPrompt,
		runId,
		node.id,
	);
	d.prepare(
		`INSERT INTO pipeline_run_steps (id, run_id, node_id, persona_id, session_id, status, seq)
		 VALUES (?, ?, ?, ?, ?, 'running', ?)`,
	).run(stepId, runId, node.id, persona?.id ?? null, stepSessionId, args.seq);

	args.handle.currentSessionId = stepSessionId;

	// declare_outcome tool: resolves the step as soon as the agent calls it.
	let settled = false;
	let resolveOutcome!: (o: StepOutcome) => void;
	const outcomePromise = new Promise<StepOutcome>((r) => {
		resolveOutcome = (o) => {
			if (settled) return;
			settled = true;
			r(o);
		};
	});

	const outcomeTool = tool(
		'declare_outcome',
		'Call this exactly once, when your work for this step is complete.',
		{
			output: z
				.enum(outputs as [string, ...string[]])
				.describe('Which named output best matches the result of your work.'),
			summary: z
				.string()
				.describe('What you did, key decisions, and what remains — handed to the next step.'),
		},
		async (a: { output: string; summary: string }) => {
			resolveOutcome({ output: a.output, summary: a.summary });
			return { content: [{ type: 'text' as const, text: 'Outcome recorded.' }] };
		},
	);
	const mcpServer = createSdkMcpServer({
		name: 'devora_pipeline',
		version: '1.0.0',
		tools: [outcomeTool],
	});

	// Autonomous sink: auto-approve permission prompts (no human between checkpoints)
	// and detect end-of-turn to surface a missing declare_outcome call.
	const sink = {
		readyState: 1 as const,
		send: (data: string) => {
			try {
				const msg = JSON.parse(data) as { type?: string; id?: string; event?: string };
				if (msg.type === 'stream-permission-request' && msg.id) {
					sdkAgent.resolvePermission(stepSessionId, msg.id, 'allow-once');
				}
				if (msg.type === 'stream-event' && msg.event === 'result') {
					// Give the tool-call path a tick to settle first.
					setTimeout(() => resolveOutcome({ awaiting: true }), 100);
				}
			} catch {
				/* ignore non-JSON */
			}
		},
	};

	const permissionMode = persona?.permission_mode || 'acceptEdits';
	sdkAgent.startOrAttach(stepSessionId, sink, {
		cwd: worktree,
		systemPrompt,
		model: persona?.model || undefined,
		effort: persona?.effort || undefined,
		permissionMode,
		mcpServers: { devora_pipeline: mcpServer },
	});

	sdkAgent.sendUserMessage(
		stepSessionId,
		buildStepPrompt({
			initialPrompt: args.initialPrompt,
			handoffSummary: args.handoffSummary,
			handoffFrom: args.handoffFrom,
			diff: args.handoffSummary != null ? gitDiff(worktree) : '',
			outputs,
		}),
	);

	const outcome = await outcomePromise;

	sdkAgent.stop(stepSessionId);
	args.handle.currentSessionId = null;

	const now = new Date().toISOString();
	d.prepare(
		`UPDATE pipeline_run_steps SET status = ?, outcome = ?, summary = ?, ended_at = ? WHERE id = ?`,
	).run(outcome.awaiting ? 'paused' : 'completed', outcome.output ?? null, outcome.summary ?? null, now, stepId);
	d.prepare(`UPDATE agent_sessions SET status = ?, ended_at = ? WHERE session_id = ?`).run(
		outcome.awaiting ? 'active' : 'completed',
		outcome.awaiting ? null : now,
		stepSessionId,
	);

	return outcome;
}

function buildStepSystemPrompt(base: string, outputs: string[]): string {
	return `${base}

---
Tu fais partie d'un pipeline agentique. Quand ton travail pour cette étape est terminé, tu DOIS appeler l'outil \`declare_outcome\` une seule fois, en choisissant l'un des outputs suivants : ${outputs
		.map((o) => `"${o}"`)
		.join(', ')}. Fournis un \`summary\` clair (ce que tu as fait, décisions, ce qu'il reste) — il sera transmis à l'étape suivante.`;
}

function buildStepPrompt(args: {
	initialPrompt: string;
	handoffSummary: string | null;
	handoffFrom: string | null;
	diff: string;
	outputs: string[];
}): string {
	const parts: string[] = [];
	if (args.handoffSummary) {
		parts.push(
			`## Handoff de l'étape précédente${args.handoffFrom ? ` (${args.handoffFrom})` : ''}\n${args.handoffSummary}`,
		);
		if (args.diff) parts.push(`## Diff cumulé du worktree\n\`\`\`diff\n${args.diff}\n\`\`\``);
	}
	parts.push(`## Objectif initial\n${args.initialPrompt}`);
	parts.push(
		`Quand tu as fini, appelle \`declare_outcome\` avec un output parmi : ${args.outputs
			.map((o) => `"${o}"`)
			.join(', ')}.`,
	);
	return parts.join('\n\n');
}

async function runEndAction(node: FlowNode, worktree: string): Promise<void> {
	if (node.data?.endAction !== 'create-pr') return;
	try {
		// Best-effort commit + push; PR creation is left to the existing flow/UI.
		execSync('git add -A && git commit -m "pipeline: automated changes" || true', {
			cwd: worktree,
			encoding: 'utf-8',
			timeout: 30000,
		});
	} catch {
		/* best-effort */
	}
}

// ── Reads for the API ──

export function getRun(runId: string): unknown {
	const d = getDb();
	if (!d) return null;
	const run = d.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId);
	if (!run) return null;
	const steps = d
		.prepare('SELECT * FROM pipeline_run_steps WHERE run_id = ? ORDER BY seq ASC')
		.all(runId);
	return { ...run, steps };
}

export function listRuns(): unknown {
	const d = getDb();
	if (!d) return [];
	return d.prepare('SELECT * FROM pipeline_runs ORDER BY created_at DESC').all();
}
