import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findClaude } from '../helpers.js';

const execFileAsync = promisify(execFile);

export function buildTurnSummaryPrompt(finalText: string, actions: string[]): string {
	const actionsBlock = actions.length ? actions.join('\n') : '(aucune action outil)';
	return `Résume ce tour d'un agent de développement en 1 à 3 puces TRÈS courtes et précises (découvertes, décisions prises, résultat). Style télégraphique, pas de préambule, pas de répétition du prompt. Réponds UNIQUEMENT avec les puces markdown.

Message final de l'agent :
${finalText}

Actions réalisées :
${actionsBlock}`;
}

export function fallbackSummary(finalText: string): string {
	const t = finalText.trim();
	return t.length > 280 ? `${t.slice(0, 280)}…` : t;
}

async function defaultRun(prompt: string): Promise<string> {
	const CLAUDE_BIN = findClaude();
	const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env as Record<
		string,
		string | undefined
	>;
	const { stdout } = await execFileAsync(CLAUDE_BIN, ['--print', '--model', 'haiku', prompt], {
		timeout: 20_000,
		maxBuffer: 1024 * 1024,
		env: cleanEnv as NodeJS.ProcessEnv,
	});
	return stdout;
}

export async function summarizeTurn(
	finalText: string,
	actions: string[],
	run: (prompt: string) => Promise<string> = defaultRun,
): Promise<string> {
	try {
		const out = (await run(buildTurnSummaryPrompt(finalText, actions))).trim();
		return out || fallbackSummary(finalText);
	} catch {
		return fallbackSummary(finalText);
	}
}
