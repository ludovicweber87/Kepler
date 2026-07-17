import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findClaude } from '../helpers.js';

const execFileAsync = promisify(execFile);

export function buildReportPrompt(logs: { log_type: string; content: string }[]): string {
	const body = logs.map((l) => `- [${l.log_type}] ${l.content}`).join('\n');
	return `À partir du journal d'activité d'un agent de développement ci-dessous, produis un rapport de synthèse EN FRANÇAIS, clair et concis. Réponds UNIQUEMENT avec le rapport markdown, sans préambule.

Format exact :
## Fait
- (ce qui a été accompli, puces courtes)

## Décisions
- (décisions techniques notables — sinon "Aucune")

## Reste à faire
- (ce qui manque ou nécessite une review — sinon "Rien")

Journal d'activité :
${body}`;
}

async function defaultRun(prompt: string): Promise<string> {
	const CLAUDE_BIN = findClaude();
	const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env as Record<
		string,
		string | undefined
	>;
	const { stdout } = await execFileAsync(CLAUDE_BIN, ['--print', '--model', 'haiku', prompt], {
		timeout: 30_000,
		maxBuffer: 1024 * 1024,
		env: cleanEnv as NodeJS.ProcessEnv,
	});
	return stdout;
}

export async function synthesizeReport(
	logs: { log_type: string; content: string }[],
	run: (prompt: string) => Promise<string> = defaultRun,
): Promise<string> {
	if (logs.length === 0) return '';
	return (await run(buildReportPrompt(logs))).trim();
}
