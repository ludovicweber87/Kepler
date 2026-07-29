import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findClaude, cleanClaudeEnv } from '../helpers.js';

const execFileAsync = promisify(execFile);

export interface RecapItemLike {
	time: string;
	type: string;
	text: string;
}

/**
 * Env épuré pour un run headless, via la liste unique de `helpers.ts` : le CLI
 * doit utiliser sa propre authentification, exactement comme le chat SDK.
 */
export function recapCleanEnv(): Record<string, string> {
	return cleanClaudeEnv() as Record<string, string>;
}

const MAX_ITEMS = 60;
const MAX_ITEM_LEN = 160;
const MAX_ACTIVITY_LEN = 4000;

/**
 * Construit le prompt du rapport de daily. Fonction pure → testable sans CLI.
 * L'activité est déjà collectée en amont (git, PRs, logs d'agents) : l'agent ne
 * fait que la synthétiser, il n'explore pas le dépôt (c'était le coût principal).
 */
export function buildRecapPrompt(
	repoFullName: string,
	date: string,
	items: RecapItemLike[],
): string {
	const activity = items
		.slice(0, MAX_ITEMS)
		.map(
			(it) =>
				`- ${it.time || '--:--'} [${it.type}] ${(it.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_LEN)}`,
		)
		.join('\n')
		.slice(0, MAX_ACTIVITY_LEN);

	return `Compte-rendu de daily (agile) en français pour ${repoFullName}, journée du ${date}.

Synthétise l'activité ci-dessous en 3 à 6 puces courtes à la première personne ("J'ai …"), regroupées par sujet. N'invente rien, n'explore pas le dépôt, n'utilise aucun outil. Réponds UNIQUEMENT avec les puces markdown, sans titre ni préambule.

Activité :
${activity}`;
}

async function defaultRun(prompt: string, cwd: string, model: string): Promise<string> {
	const { stdout } = await execFileAsync(findClaude(), ['--print', '--model', model, prompt], {
		cwd,
		timeout: 60_000,
		maxBuffer: 1024 * 1024,
		env: recapCleanEnv(),
	});
	return stdout;
}

/**
 * Génère le contenu d'un rapport en one-shot headless (`claude --print`),
 * comme `reportSynth` / `turnSummarizer`. Retourne le markdown final.
 */
export async function runRecapAgent(params: {
	cwd: string;
	prompt: string;
	model?: string;
	run?: (prompt: string, cwd: string, model: string) => Promise<string>;
}): Promise<string> {
	const run = params.run ?? defaultRun;
	const out = await run(params.prompt, params.cwd, params.model ?? 'haiku');
	return out.trim();
}
