import { getDb } from '../db.js';
import { readFirstUserText, readAgentName, persistAgentName } from './autoRename.js';

/**
 * Titre de session dérivé du premier prompt — approche déterministe façon Orca
 * (`deriveGeneratedTabTitle`). Aucune dépendance LLM, aucune condition de branche :
 * une fonction pure, instantanée, testable, qui alimente le label `agent_name`
 * affiché dans la sidebar. Le renommage de branche git (autoRename.ts) reste
 * un mécanisme séparé.
 */

export const GENERATED_TITLE_MAX_LENGTH = 40;
export const GENERATED_TITLE_SOURCE_SCAN_LIMIT = 512;

/**
 * Formules de politesse / verbes d'intention en tête de prompt à retirer avant
 * d'extraire le titre. Anglais (porté d'Orca) + français (l'usage courant ici).
 */
const LEADING_FILLER_PATTERNS: RegExp[] = [
	// ── Anglais ──
	/^(?:can|could|would)\s+you(?:\s+please)?\s+/i,
	/^please(?:\s+|$)/i,
	/^i\s+(?:want|need|would\s+like)\s+(?:you\s+)?to\s+/i,
	/^help\s+me(?:\s+to)?\s+/i,
	/^help\s+/i,
	/^let'?s\s+/i,
	/^we\s+need\s+to\s+/i,
	/^need\s+to\s+/i,
	// ── Français ──
	/^(?:peux|pourrais)-?\s?tu\s+(?:s'?il\s+te\s+pla[îi]t\s+)?/i,
	/^(?:pouvez|pourriez)-?\s?vous\s+(?:s'?il\s+vous\s+pla[îi]t\s+)?/i,
	/^s'?il\s+te\s+pla[îi]t,?\s+/i,
	/^s'?il\s+vous\s+pla[îi]t,?\s+/i,
	/^merci\s+de\s+/i,
	/^j'?aimerais\s+(?:que\s+tu\s+|bien\s+)?/i,
	/^je\s+(?:veux|voudrais|souhaite)\s+(?:que\s+tu\s+)?/i,
	/^il\s+(?:faut|faudrait)\s+(?:que\s+tu\s+)?/i,
	/^on\s+(?:doit|va|a\s+besoin\s+de)\s+/i,
	/^stp,?\s+/i,
	/^svp,?\s+/i,
];

function capitalizeFirstLetter(value: string): string {
	return value.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	const rawSlice = value.slice(0, maxLength);
	const sliced = rawSlice.trim();
	if (sliced.length < rawSlice.length) return sliced;
	const lastSpace = sliced.lastIndexOf(' ');
	if (lastSpace >= Math.floor(maxLength * 0.55)) return sliced.slice(0, lastSpace).trim();
	return sliced;
}

function isTitleWhitespace(code: number): boolean {
	return (
		code === 32 ||
		(code >= 9 && code <= 13) ||
		code === 160 ||
		code === 5760 ||
		(code >= 8192 && code <= 8202) ||
		code === 8232 ||
		code === 8233 ||
		code === 8239 ||
		code === 8287 ||
		code === 12288 ||
		code === 65279
	);
}

/** Replie toute suite d'espaces (y compris exotiques) en un seul espace simple. */
function foldWhitespace(value: string): string {
	let normalized = '';
	let pending = false;
	for (let i = 0; i < value.length; i += 1) {
		if (isTitleWhitespace(value.charCodeAt(i))) {
			pending = normalized.length > 0;
			continue;
		}
		if (pending) {
			normalized += ' ';
			pending = false;
		}
		normalized += value.charAt(i);
	}
	return normalized;
}

/**
 * Dérive un titre lisible depuis le premier prompt. Retourne `null` si rien
 * d'exploitable (prompt vide, uniquement du filler ou de la ponctuation).
 */
export function deriveSessionTitle(prompt: string): string | null {
	// Les prompts peuvent être volumineux (collages) : on ne scanne qu'un préfixe.
	const preview = prompt.slice(0, GENERATED_TITLE_SOURCE_SCAN_LIMIT);
	const firstClause = preview
		.trim()
		// Retire les URLs avant la ponctuation markdown (un chemin `/foo_bar` ne
		// doit pas fuiter des fragments dans le titre).
		.replace(/https?:\/\/\S+/gi, ' ')
		.replace(/[`*_~#>[\]{}()]/g, ' ')
		.replace(/^(?:issue|task|bug|feature|pr|ticket)\s*(?:#?\d+)?\s*[:-]\s*/i, '')
		.split(/[.!?;\n\r\u2028\u2029]/u)[0]
		?.trim();

	if (!firstClause) return null;

	let candidate = firstClause;
	for (let i = 0; i < 3; i += 1) {
		const before = candidate;
		for (const pattern of LEADING_FILLER_PATTERNS) {
			candidate = candidate.replace(pattern, '');
		}
		candidate = candidate.trim();
		if (candidate === before.trim()) break;
	}

	candidate = foldWhitespace(candidate.replace(/[^\p{L}\p{N}\s]/gu, ' '));
	if (!candidate) return null;

	return truncateAtWordBoundary(capitalizeFirstLetter(candidate), GENERATED_TITLE_MAX_LENGTH);
}

/**
 * Applique le titre dérivé du premier prompt à `agent_name` (best-effort, sync).
 * Idempotent : toujours dérivé du PREMIER message user. Ne touche jamais une
 * session dont le titre a été épinglé par un renommage manuel (`title_pinned`).
 * Écrase en revanche un nom posé par une persona / une issue à la création.
 * Retourne le titre écrit, ou `null` si aucun changement.
 */
export function applyGeneratedTitle(sessionId: string): string | null {
	const d = getDb();
	if (!d) return null;
	try {
		const row = d
			.prepare('SELECT id, title_pinned FROM agent_sessions WHERE session_id = ?')
			.get(sessionId) as { id: string; title_pinned: number | null } | undefined;
		if (!row || row.title_pinned) return null; // manual rename wins

		const text = readFirstUserText(sessionId);
		if (!text) return null;

		const title = deriveSessionTitle(text);
		if (!title) return null;
		if (readAgentName(row.id) === title) return null; // évite les écritures inutiles

		persistAgentName(row.id, title);
		return title;
	} catch {
		return null;
	}
}
