import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findClaude, cleanClaudeEnv } from '../helpers.js';

const execFileAsync = promisify(execFile);

export function buildTurnSummaryPrompt(finalText: string, actions: string[]): string {
	const actionsBlock = actions.length ? actions.join('\n') : '(aucune action outil)';
	return `Résume ce tour d'un agent de développement en puces markdown claires et complètes (découvertes, décisions prises, fichiers modifiés, résultat). Va à l'essentiel mais ne tronque rien : termine chaque phrase et couvre l'ensemble du tour. Pas de préambule, pas de répétition du prompt. Réponds UNIQUEMENT avec les puces markdown.

Message final de l'agent :
${finalText}

Actions réalisées :
${actionsBlock}`;
}

const FALLBACK_LIMIT = 1200;

export function fallbackSummary(finalText: string): string {
	const t = finalText.trim();
	if (t.length <= FALLBACK_LIMIT) return t;
	const slice = t.slice(0, FALLBACK_LIMIT);
	// Coupe sur une frontière de phrase/mot pour ne pas casser un mot en plein milieu.
	const boundary = Math.max(
		slice.lastIndexOf('. '),
		slice.lastIndexOf('\n'),
		slice.lastIndexOf(' '),
	);
	const cut = boundary > FALLBACK_LIMIT * 0.6 ? slice.slice(0, boundary) : slice;
	return `${cut.trimEnd()}…`;
}

async function defaultRun(prompt: string): Promise<string> {
	const CLAUDE_BIN = findClaude();
	const { stdout } = await execFileAsync(CLAUDE_BIN, ['--print', '--model', 'haiku', prompt], {
		timeout: 45_000,
		maxBuffer: 1024 * 1024,
		env: cleanClaudeEnv(),
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
