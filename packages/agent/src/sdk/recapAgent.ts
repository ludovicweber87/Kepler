import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import { findClaude, cleanClaudeEnv } from '../helpers.js';

export type QueryFn = typeof realQuery;

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

/**
 * Construit le prompt du rapport de daily. Fonction pure → testable sans SDK.
 * L'agent reçoit l'activité déjà collectée ET l'autorisation d'explorer git
 * en lecture seule dans `cwd` si le contexte fourni paraît incomplet.
 */
export function buildRecapPrompt(
	repoFullName: string,
	date: string,
	items: RecapItemLike[],
): string {
	const activity =
		items.length === 0
			? '(aucune activité pré-collectée — inspecte toi-même le dépôt)'
			: items
					.map((it) => `- ${it.time || '--:--'} [${it.type}] ${it.text}`)
					.join('\n')
					.slice(0, 9000);

	return `Tu rédiges un compte-rendu de "daily" (méthode agile) en français pour le dépôt ${repoFullName}, pour la journée du ${date} (date locale).

Tu travailles dans le dossier local du dépôt. Tu peux, EN LECTURE SEULE, inspecter l'historique git pour compléter le contexte, par exemple :
- \`git log --all --no-merges --since="${date} 00:00:00" --until="${date} 23:59:59" --format='%aI %s (%an)'\`
- \`git show\` / \`git diff\` sur les commits du jour si besoin de détail.
Tu ne DOIS jamais modifier, committer, push ou exécuter la moindre commande qui change l'état du dépôt.

Consignes de rédaction :
- Écris à la première personne ("J'ai …").
- Puces courtes, regroupe ce qui va ensemble.
- Ne mentionne QUE ce qui a réellement eu lieu ce jour-là, n'invente rien.
- Si vraiment rien ne s'est passé ce jour-là, réponds exactement : "_Aucune activité enregistrée pour ce jour._"
- Pas de préambule ni de conclusion. Réponds UNIQUEMENT avec le rapport en markdown.

Activité déjà collectée :
${activity}`;
}

/**
 * Génère le contenu d'un rapport via l'Agent SDK, en one-shot headless
 * (pas de WebSocket, pas de session persistante). Retourne le markdown final.
 */
export async function runRecapAgent(params: {
	cwd: string;
	prompt: string;
	model?: string;
	maxTurns?: number;
	queryFn?: QueryFn;
}): Promise<string> {
	const queryFn = params.queryFn ?? realQuery;
	const options: Record<string, unknown> = {
		cwd: params.cwd,
		pathToClaudeCodeExecutable: findClaude(),
		env: recapCleanEnv(),
		permissionMode: 'bypassPermissions',
		allowDangerouslySkipPermissions: true,
		allowedTools: ['Bash', 'Read', 'Grep', 'Glob'],
		maxTurns: params.maxTurns ?? 12,
	};
	if (params.model) options.model = params.model;

	const q = queryFn({ prompt: params.prompt, options } as never) as AsyncIterable<unknown>;

	let resultText = '';
	let assistantText = '';
	for await (const msg of q) {
		const m = msg as {
			type?: string;
			result?: unknown;
			message?: { content?: Array<{ type?: string; text?: string }> };
		};
		if (m.type === 'assistant' && Array.isArray(m.message?.content)) {
			for (const block of m.message!.content!) {
				if (block?.type === 'text' && typeof block.text === 'string') {
					assistantText += block.text;
				}
			}
		}
		if (m.type === 'result' && typeof m.result === 'string') {
			resultText = m.result;
		}
	}

	return (resultText || assistantText).trim();
}
