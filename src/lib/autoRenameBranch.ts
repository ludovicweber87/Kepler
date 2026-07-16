import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';

/** Resolve the `claude` binary robustly (mirrors the agent server's findClaude). */
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

// Guard against concurrent renames triggered by rapid activity logs.
const inProgress = new Set<string>();

/**
 * Normalize a raw string into a Karma-style kebab branch name (`feat-add-auth`).
 * Capped at 4 segments (type + 3 words → max 3 dashes) to keep branch names short.
 */
export function toKarmaKebab(raw: string): string | null {
	const cleaned = raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s/-]/g, '')
		.replace(/[\s/]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.split('-')
		.slice(0, 4)
		.join('-')
		.slice(0, 50)
		.replace(/-+$/, '');
	return cleaned.length >= 3 ? cleaned : null;
}

// Mots vides (FR + EN) filtrés pour garder un slug lisible.
const STOP_WORDS = new Set([
	'le',
	'la',
	'les',
	'un',
	'une',
	'des',
	'de',
	'du',
	'ne',
	'pas',
	'et',
	'ou',
	'au',
	'aux',
	'ce',
	'ca',
	'cet',
	'cette',
	'que',
	'qui',
	'quoi',
	'dans',
	'sur',
	'pour',
	'avec',
	'sans',
	'je',
	'tu',
	'il',
	'elle',
	'on',
	'nous',
	'vous',
	'ils',
	'elles',
	'mon',
	'ma',
	'mes',
	'son',
	'the',
	'a',
	'an',
	'to',
	'of',
	'in',
	'on',
	'for',
	'with',
	'and',
	'or',
	'is',
	'it',
	'this',
	'that',
	'these',
	'those',
	'be',
	'by',
	'as',
	'at',
]);

/**
 * Fallback purement local (sans LLM) : dérive un nom de branche Karma à partir du
 * texte. Choisit un type par heuristique de mots-clés (défaut `feat`), filtre les
 * mots vides, garde les premiers mots significatifs. Toujours déterministe.
 */
export function localSlug(text: string): string | null {
	const t = text.trim().toLowerCase();
	if (!t) return null;

	let type = 'feat';
	if (/(^|\s)(fix|bug|corrig|répar|repar|erreur|error|casse|broken|plante|crash)/.test(t))
		type = 'fix';
	else if (/(^|\s)(refactor|refacto|clean|nettoy|réorganis|reorganis|simplif)/.test(t))
		type = 'refactor';
	else if (/(^|\s)(doc|docs|documentation|readme)/.test(t)) type = 'docs';
	else if (/(^|\s)(test|tests|spec)/.test(t)) type = 'test';
	else if (/(^|\s)(chore|config|bump|dépendance|dependance|dependency|dependencies)/.test(t))
		type = 'chore';

	const body = t
		.replace(/[^a-z0-9\s-]/g, ' ')
		.split(/\s+/)
		.filter((w) => w.length > 2 && !STOP_WORDS.has(w))
		.slice(0, 3)
		.join('-');

	const kebab = toKarmaKebab(`${type}-${body}`);
	return kebab;
}

/**
 * Core rename: if a session's worktree still has an auto-generated `wip-` branch,
 * synthesize a Karma-convention name from `text` and rename the BRANCH only
 * (`git branch -m`, directory untouched → safe while the session runs).
 *
 * Awaitable; resolves to the new branch name, or null if nothing was renamed
 * (already named, guard busy, or any failure → graceful degradation).
 */
export async function renameBranchFromText(
	session: { id: string; branch: string | null; worktree_path: string | null },
	text: string,
): Promise<string | null> {
	if (!session.branch?.startsWith('wip-') || !session.worktree_path) return null;
	if (!text.trim() || inProgress.has(session.id)) return null;
	inProgress.add(session.id);

	try {
		// 1) Nom "joli" via LLM ; échec/timeout → on retombe sur le fallback local.
		let newName = generateNameViaClaude(text);
		if (!newName) newName = localSlug(text);
		if (!newName || newName === session.branch) return null;

		// 2) Renomme la BRANCHE uniquement (dossier intact → safe pendant la session).
		try {
			execSync(
				`git -C ${JSON.stringify(session.worktree_path)} branch -m ${JSON.stringify(newName)}`,
				{ stdio: 'ignore' },
			);
		} catch (err) {
			console.warn(
				'[autoRenameBranch] git branch -m a échoué :',
				err instanceof Error ? err.message : err,
			);
			return null;
		}

		db.update(schema.agentSessions)
			.set({ branch: newName })
			.where(eq(schema.agentSessions.id, session.id))
			.run();
		return newName;
	} finally {
		inProgress.delete(session.id);
	}
}

/**
 * Génère un nom de branche via `claude --print`. Retourne null (sans throw) en cas
 * d'échec/timeout/absence de nom exploitable, en loguant la cause — l'appelant
 * bascule alors sur le fallback local déterministe.
 */
function generateNameViaClaude(text: string): string | null {
	try {
		const prompt = `Transforme cette demande en un nom de branche git court, convention Karma (format: type suivi de 3 mots MAXIMUM en kebab, ex: "feat-add-google-auth"). Types autorisés: feat, fix, docs, refactor, test, chore. Réponds UNIQUEMENT le nom, sans guillemets ni autre texte.\n\nDemande: ${text.slice(0, 500)}`;
		const escaped = prompt.replace(/'/g, "'\\''");
		const out = execSync(`${CLAUDE_BIN} --print '${escaped}'`, {
			encoding: 'utf-8',
			timeout: 30_000,
			maxBuffer: 1024 * 1024,
		});
		const name = toKarmaKebab(out);
		if (!name) {
			console.warn(
				'[autoRenameBranch] claude --print : aucun nom exploitable, fallback local',
			);
		}
		return name;
	} catch (err) {
		console.warn(
			'[autoRenameBranch] claude --print a échoué, fallback local :',
			err instanceof Error ? err.message : err,
		);
		return null;
	}
}

/**
 * Fire-and-forget wrapper: renames the branch from `activity` without blocking the
 * caller (used from the activity-log endpoint as a safety net). Never throws.
 */
export function maybeAutoRenameBranch(
	session: { id: string; branch: string | null; worktree_path: string | null },
	activity: string,
): void {
	void renameBranchFromText(session, activity);
}
