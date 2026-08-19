import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import { findClaude } from '../helpers.js';
import { recapCleanEnv } from './recapAgent.js';

export type QueryFn = typeof realQuery;

export type DocSourceType = 'knowledge' | 'repo';
export type DocLevel = 'beginner' | 'intermediate' | 'senior';
export type DocLength = 'short' | 'medium' | 'long';
export type DocFormat = 'overview' | 'tutorial' | 'reference' | 'cheatsheet' | 'comparison';

export interface DocBrief {
	subject: string;
	source_type: DocSourceType;
	repo_full_name?: string | null;
	level: DocLevel;
	length: DocLength;
	format: DocFormat;
	angle?: string | null;
}

const LEVEL_LABEL: Record<DocLevel, string> = {
	beginner: 'débutant (vocabulaire simple, on explique les prérequis)',
	intermediate: 'intermédiaire (connaît les bases, va droit au but)',
	senior: 'senior (concis, technique, nuances et cas limites)',
};

const LENGTH_LABEL: Record<DocLength, string> = {
	short: 'courte (~300-500 mots, l’essentiel)',
	medium: 'moyenne (~800-1200 mots)',
	long: 'longue (~2000+ mots, exhaustive)',
};

const FORMAT_LABEL: Record<DocFormat, string> = {
	overview: "vue d'ensemble conceptuelle (comprendre le sujet dans les grandes lignes)",
	tutorial: 'tutoriel pas-à-pas (étapes concrètes, on suit une progression)',
	reference: 'documentation de référence (structurée, exhaustive, consultable)',
	cheatsheet: 'cheat sheet (aide-mémoire condensé, listes et tableaux)',
	comparison: 'comparatif (mise en regard d’options, tableau + recommandation)',
};

/**
 * Prompt système du persona rédacteur de docs. Constante de code (jamais exposée
 * dans l'UI ni la table personas). Contrainte clé : renvoyer TOUJOURS la doc
 * complète en Markdown, un seul artefact, sans préambule.
 */
export function buildDocWriterSystemPrompt(): string {
	return `Tu es un rédacteur technique expert. Ta mission : produire une documentation claire, exacte et directement exploitable, en Markdown.

Règles absolues :
- Réponds UNIQUEMENT avec la documentation, en Markdown valide. Aucun préambule ("Voici…"), aucune conclusion méta, aucune question.
- Renvoie TOUJOURS la documentation ENTIÈRE et autonome, même lors d'une retouche : ton message est le document complet, pas un diff ni un extrait.
- Commence par un titre \`#\` puis structure en sections \`##\`/\`###\`. Utilise listes, tableaux et blocs de code annotés du bon langage.
- Sois exact. N'invente pas d'API, de commandes ou de comportements. En cas d'incertitude, reste général plutôt que faux.
- Adapte profondeur, ton et longueur aux consignes fournies (niveau, longueur, format, angle).`;
}

/** Prompt utilisateur initial (le "brief") à partir des champs de la doc. */
export function buildDocBrief(brief: DocBrief): string {
	const lines: string[] = [];
	lines.push(`Rédige une documentation sur : « ${brief.subject} ».`);
	lines.push('');
	lines.push(`- Format : ${FORMAT_LABEL[brief.format]}`);
	lines.push(`- Niveau du lecteur : ${LEVEL_LABEL[brief.level]}`);
	lines.push(`- Longueur cible : ${LENGTH_LABEL[brief.length]}`);
	if (brief.source_type === 'repo' && brief.repo_full_name) {
		lines.push(
			`- Source : le code du dépôt « ${brief.repo_full_name} », disponible dans ton dossier de travail. Explore-le EN LECTURE SEULE (Read/Grep/Glob) pour documenter ce qui existe réellement. Ne modifie, ne commit, n'exécute rien qui change le dépôt.`,
		);
	} else {
		lines.push(
			`- Source : tes connaissances. Tu peux utiliser la recherche web si disponible pour vérifier/actualiser les informations.`,
		);
	}
	if (brief.angle && brief.angle.trim()) {
		lines.push(`- Angle / focus particulier : ${brief.angle.trim()}`);
	}
	return lines.join('\n');
}

/** Outils autorisés selon la source. Web autorisé best-effort (allowlist sans effet si l'outil n'existe pas). */
export function toolPolicyFor(sourceType: DocSourceType): string[] {
	if (sourceType === 'repo') return ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'];
	return ['WebSearch', 'WebFetch'];
}

/**
 * Exécute le rédacteur en one-shot headless (pas de WebSocket). Retourne le
 * Markdown final.
 */
export async function runDocWriterAgent(params: {
	cwd: string;
	systemPrompt: string;
	prompt: string;
	allowedTools: string[];
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
		systemPrompt: params.systemPrompt,
		allowedTools: params.allowedTools,
		maxTurns: params.maxTurns ?? 16,
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
			// Un nouveau tour assistant remplace le texte accumulé : on ne garde
			// que la dernière réponse complète (le document final).
			let turn = '';
			for (const block of m.message!.content!) {
				if (block?.type === 'text' && typeof block.text === 'string') turn += block.text;
			}
			if (turn) assistantText = turn;
		}
		if (m.type === 'result' && typeof m.result === 'string') resultText = m.result;
	}

	return (resultText || assistantText).trim();
}
