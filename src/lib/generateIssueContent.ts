import { execFile, execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Resolve the `claude` binary robustly (mirrors the agent server). */
function findClaude(): string {
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
	try {
		const resolved = execSync('command -v claude', { encoding: 'utf-8' }).trim();
		if (resolved) return resolved;
	} catch {
		/* continue */
	}
	return 'claude';
}

const CLAUDE_BIN = findClaude();

export interface GeneratedIssue {
	title: string;
	body: string;
}

function buildPrompt(description: string, repo?: string): string {
	const repoLine = repo ? `Dépôt concerné : ${repo}\n` : '';
	return `Tu es un assistant qui rédige des issues GitHub claires et bien structurées à partir d'une demande brute d'un développeur.
${repoLine}
Demande brute :
"""
${description.slice(0, 4000)}
"""

Consignes :
- Déduis un TITRE court, précis et actionnable (pas de ponctuation finale, pas de préfixe type "feat:").
- Rédige un BODY en Markdown, structuré avec des sections pertinentes parmi : "## Contexte", "## Objectif", "## Critères d'acceptation" (liste à cocher \`- [ ]\`). N'ajoute que les sections utiles.
- N'invente AUCUNE information technique absente de la demande ; reste fidèle à l'intention.
- Écris dans la MÊME langue que la demande brute.
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans bloc de code, au format exact :
{"title": "...", "body": "..."}`;
}

/**
 * Extrait un objet {title, body} de la sortie de `claude --print`. Tolère les
 * blocs de code (```json ... ```) et le texte parasite autour du JSON. Retourne
 * null si rien d'exploitable n'est trouvé (l'appelant applique alors un fallback).
 */
export function parseGeneratedIssue(raw: string): GeneratedIssue | null {
	const stripped = raw.replace(/```(?:json)?/gi, '').trim();
	const start = stripped.indexOf('{');
	const end = stripped.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) return null;
	try {
		const parsed = JSON.parse(stripped.slice(start, end + 1)) as {
			title?: unknown;
			body?: unknown;
		};
		const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
		const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
		if (!title) return null;
		return { title, body };
	} catch {
		return null;
	}
}

/**
 * Génère un titre + un body Markdown pour une issue à partir d'une description
 * brute, via `claude --print` en one-shot headless. En cas d'échec (timeout,
 * binaire absent, JSON illisible), applique un fallback déterministe : titre =
 * première ligne, body = reste de la description — jamais bloquant.
 */
export async function generateIssueContent(
	description: string,
	repo?: string,
): Promise<GeneratedIssue> {
	const fallback = (): GeneratedIssue => {
		const lines = description.trim().split('\n');
		const title = (lines[0] ?? '').trim().slice(0, 120) || description.trim().slice(0, 120);
		const body = lines.slice(1).join('\n').trim();
		return { title, body };
	};

	try {
		const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env;
		void CLAUDECODE;
		void CLAUDE_CODE_ENTRYPOINT;
		const { stdout } = await execFileAsync(
			CLAUDE_BIN,
			['--print', buildPrompt(description, repo)],
			{
				encoding: 'utf-8',
				timeout: 30_000,
				maxBuffer: 1024 * 1024,
				env: cleanEnv,
			},
		);
		const parsed = parseGeneratedIssue(stdout);
		if (!parsed) {
			console.warn('[generateIssueContent] JSON illisible, fallback local');
			return fallback();
		}
		return parsed;
	} catch (err) {
		console.warn(
			'[generateIssueContent] claude --print a échoué, fallback local :',
			err instanceof Error ? err.message : err,
		);
		return fallback();
	}
}
