/**
 * Spike #1 — fige les formes réelles du Claude Agent SDK (lot 1).
 *
 * Objectif : query() en streaming-input, 1 message user, logger chaque
 * SDKMessage brut → confirmer les noms de champs (assistant.message.content,
 * result.result / is_error / session_id, system/init.session_id) et que l'auth
 * abonnement claude.ai marche SANS ANTHROPIC_API_KEY.
 *
 * Usage : node packages/agent/spike-sdk-shape.mjs
 * Throwaway — à supprimer après le spike.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

function findClaude() {
	if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
	const paths = [
		join(homedir(), '.local/bin/claude'),
		'/opt/homebrew/bin/claude',
		'/usr/local/bin/claude',
		'/usr/bin/claude',
	];
	for (const p of paths) {
		try {
			execSync(`test -x ${p}`, { stdio: 'ignore' });
			return p;
		} catch {
			/* continue */
		}
	}
	return 'claude';
}

// Env nettoyé : surtout PAS d'ANTHROPIC_API_KEY (sinon bascule sur l'auth API).
const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;
delete env.CLAUDECODE;
delete env.CLAUDE_CODE_ENTRYPOINT;

// File asynchrone minimale : reproduit le pushUserMessage() de la spec.
function makePromptQueue() {
	const queue = [];
	let resolve = null;
	let done = false;
	async function* gen() {
		while (!done) {
			if (queue.length === 0) {
				await new Promise((r) => (resolve = r));
				continue;
			}
			yield queue.shift();
		}
	}
	return {
		iterable: gen(),
		push(text) {
			queue.push({
				type: 'user',
				message: { role: 'user', content: text },
				parent_tool_use_id: null,
			});
			resolve?.();
		},
		close() {
			done = true;
			resolve?.();
		},
	};
}

function summarize(msg) {
	// Résumé compact + garde les clés top-level pour figer la forme.
	const base = { type: msg.type, subtype: msg.subtype, keys: Object.keys(msg) };
	if (msg.type === 'assistant' || msg.type === 'user') {
		base.message_keys = msg.message ? Object.keys(msg.message) : null;
		// Ne garder que la forme des blocs (type + clés) — pas le contenu verbeux.
		const content = msg.message?.content;
		base.blocks = Array.isArray(content)
			? content.map((b) => ({ type: b.type, keys: Object.keys(b) }))
			: content;
		if (msg.type === 'user' && 'tool_use_result' in msg)
			base.has_tool_use_result = msg.tool_use_result !== undefined;
	}
	if (msg.type === 'result') {
		base.is_error = msg.is_error;
		base.result = msg.result;
		base.session_id = msg.session_id;
		base.num_turns = msg.num_turns;
	}
	if (msg.type === 'system') {
		base.session_id = msg.session_id;
		base.model = msg.model;
		base.permissionMode = msg.permissionMode;
	}
	return base;
}

// Scénario : `node spike-sdk-shape.mjs [plan|edit]`
//  - plan (défaut) : pas d'outil, fige assistant/result/system.
//  - edit          : force un tool_use réel (Write) pour figer tool_use/tool_result.
const SCENARIO = process.argv[2] === 'edit' ? 'edit' : 'plan';
const runCwd =
	SCENARIO === 'edit'
		? mkdtempSync(join(tmpdir(), 'kepler-spike-'))
		: tmpdir();

const prompt = makePromptQueue();
const CLAUDE_BIN = findClaude();
console.error(`[spike] scénario: ${SCENARIO} — cwd: ${runCwd}`);
console.error(`[spike] claude bin: ${CLAUDE_BIN}`);
console.error(`[spike] ANTHROPIC_API_KEY présent dans l'env passé au SDK ? ${'ANTHROPIC_API_KEY' in env}`);

const q = query({
	prompt: prompt.iterable,
	options: {
		cwd: runCwd,
		pathToClaudeCodeExecutable: CLAUDE_BIN,
		env,
		permissionMode: SCENARIO === 'edit' ? 'acceptEdits' : 'plan',
		model: 'claude-sonnet-4-5',
		maxTurns: 4,
	},
});

prompt.push(
	SCENARIO === 'edit'
		? "Crée un fichier nommé spike.txt contenant exactement le texte 'ok' dans le répertoire courant, puis confirme en un mot."
		: "Réponds exactement le mot: pong. Rien d'autre.",
);

let capturedSessionId = null;
try {
	for await (const msg of q) {
		console.log(JSON.stringify(summarize(msg)));
		if (msg.type === 'system' && msg.subtype === 'init') capturedSessionId = msg.session_id;
		if (msg.type === 'result') {
			console.error(`[spike] RESULT reçu — session_id=${msg.session_id} is_error=${msg.is_error}`);
			console.error(`[spike] claudeSessionId capturé au system/init = ${capturedSessionId}`);
			prompt.close();
			break;
		}
	}
} catch (err) {
	console.error('[spike] ERREUR:', err?.message || err);
	process.exitCode = 1;
} finally {
	try {
		await q.interrupt?.();
	} catch {
		/* ignore */
	}
}
console.error('[spike] terminé.');
