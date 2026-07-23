import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { basename, dirname, join, isAbsolute } from 'node:path';
import { findClaude } from '../helpers.js';
import { getDb } from '../db.js';

const execFileAsync = promisify(execFile);

/**
 * Format strict d'un slug de branche auto-généré : un type conventionnel suivi
 * de 1 à 4 mots-clés anglais en kebab-case (5 segments max au total).
 * Tout ce qui ne matche pas (français, accents, majuscules, trop long) est rejeté.
 */
export const SLUG_RE = /^(feat|fix|docs|refactor|test|chore)(-[a-z0-9]+){1,4}$/;
export const MAX_SLUG_LENGTH = 40;

/** Nettoie une sortie LLM et la valide contre le format strict. Null si invalide. */
export function validateSlug(raw: string): string | null {
	const s = raw
		.trim()
		.replace(/^[`"']+|[`"']+$/g, '')
		.trim();
	if (!s || s.length > MAX_SLUG_LENGTH) return null;
	return SLUG_RE.test(s) ? s : null;
}

/**
 * Slugifie une saisie manuelle (dialog de renommage) en kebab-case sûr pour git.
 * Contrairement à `validateSlug`, n'impose pas de préfixe de type.
 */
export function slugifyBranchInput(raw: string): string | null {
	const s = raw
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
	return s.length >= 2 ? s : null;
}

/** Résout une collision de nom en suffixant -2..-9. Null si tout est pris. */
export function dedupeSlug(slug: string, exists: (name: string) => boolean): string | null {
	if (!exists(slug)) return slug;
	for (let i = 2; i <= 9; i++) {
		const candidate = `${slug}-${i}`;
		if (!exists(candidate)) return candidate;
	}
	return null;
}

/** Prompt LLM (anglais) : synthèse de la première demande → slug de branche. */
export function buildBranchNamePrompt(firstRequest: string): string {
	return `You are given the first request a developer sent to a coding agent. Infer the actual TASK and produce a git branch slug that summarizes it.
STRICT format: <type>-<keywords> where <type> is one of feat, fix, docs, refactor, test, chore and <keywords> is 1 to 4 meaningful English words in kebab-case.
Rules:
- English ONLY. Translate if the request is written in another language.
- Lowercase letters, digits and hyphens only.
- Pick MEANINGFUL words (the domain and the action), never filler words or greetings.
- Ignore chit-chat, politeness and irrelevant context.
- Reply with ONLY the slug — no quotes, no punctuation, no explanation.

Request:
${firstRequest.slice(0, 1500)}`;
}

async function defaultRun(prompt: string): Promise<string> {
	const CLAUDE_BIN = findClaude();
	const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env as Record<
		string,
		string | undefined
	>;
	const { stdout } = await execFileAsync(CLAUDE_BIN, ['--print', '--model', 'haiku', prompt], {
		timeout: 30_000,
		maxBuffer: 1024 * 512,
		env: cleanEnv as NodeJS.ProcessEnv,
	});
	return stdout;
}

/**
 * Génère un slug via `claude --print` (async, non bloquant) et le valide.
 * Null (sans throw) si échec, timeout ou sortie invalide — l'appelant garde
 * le nom `wip-` et retentera au prochain tour. Aucun fallback local : on
 * préfère pas de rename à un nom médiocre ou en français.
 */
export async function generateBranchSlug(
	firstRequest: string,
	run: (prompt: string) => Promise<string> = defaultRun,
): Promise<string | null> {
	try {
		const out = await run(buildBranchNamePrompt(firstRequest));
		const slug = validateSlug(out);
		if (!slug) console.warn('[autoRename] sortie LLM invalide, rename différé :', out.slice(0, 80));
		return slug;
	} catch (err) {
		console.warn(
			'[autoRename] claude --print a échoué, rename différé :',
			err instanceof Error ? err.message : err,
		);
		return null;
	}
}

// ── Accès DB (session + transcript) ──

export interface SessionRow {
	id: string;
	branch: string | null;
	worktree_path: string | null;
}

export function isAutoNamed(branch: string | null | undefined): boolean {
	return !!branch?.startsWith('wip-');
}

/**
 * Le dossier du worktree doit-il être réaligné sur la branche ? Vrai quand la
 * branche a déjà un nom final (non `wip-`) mais que le dossier est resté `wip-`
 * (move raté ou jamais tenté). Ne touche jamais un dossier nommé manuellement
 * (qui ne commence pas par `wip-`). Idempotent : faux dès que dossier == branche.
 */
export function worktreeNeedsMove(row: SessionRow): boolean {
	if (!row.branch || !row.worktree_path) return false;
	if (isAutoNamed(row.branch)) return false; // la phase 1 (rename branche) s'en occupe
	const current = basename(row.worktree_path);
	if (!current.startsWith('wip-')) return false;
	return current !== row.branch.replace(/\//g, '-');
}

export function readSessionRow(sessionId: string): SessionRow | null {
	const d = getDb();
	if (!d) return null;
	try {
		const row = d
			.prepare('SELECT id, branch, worktree_path FROM agent_sessions WHERE session_id = ?')
			.get(sessionId) as SessionRow | undefined;
		return row ?? null;
	} catch {
		return null;
	}
}

/** Premier message user du transcript — la « première demande » qui nomme la branche. */
export function readFirstUserText(sessionId: string): string | null {
	const d = getDb();
	if (!d) return null;
	try {
		const row = d
			.prepare(
				"SELECT content FROM agent_chat_messages WHERE agent_session_id = ? AND event_type = 'user' ORDER BY seq ASC LIMIT 1",
			)
			.get(sessionId) as { content: string } | undefined;
		if (!row) return null;
		const parsed = JSON.parse(row.content) as { data?: { text?: string } };
		const text = parsed.data?.text?.trim();
		return text || null;
	} catch {
		return null;
	}
}

// ── Opérations git ──

export function localBranchExists(worktreePath: string, branch: string): boolean {
	try {
		execFileSync(
			'git',
			['-C', worktreePath, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
			{ timeout: 5000, stdio: 'ignore' },
		);
		return true;
	} catch {
		return false;
	}
}

/** Racine du repo principal (pas du worktree) — point d'appui sûr pour `worktree move`. */
export function mainRepoRoot(worktreePath: string): string | null {
	try {
		const commonDir = execFileSync('git', ['-C', worktreePath, 'rev-parse', '--git-common-dir'], {
			encoding: 'utf-8',
			timeout: 5000,
		}).trim();
		const abs = isAbsolute(commonDir) ? commonDir : join(worktreePath, commonDir);
		return dirname(abs);
	} catch {
		return null;
	}
}

/** `git branch -m` dans le worktree. True si OK. */
export function renameBranchInWorktree(worktreePath: string, newName: string): boolean {
	try {
		execFileSync('git', ['-C', worktreePath, 'branch', '-m', newName], {
			timeout: 10_000,
			stdio: 'ignore',
		});
		return true;
	} catch (err) {
		console.warn(
			'[autoRename] git branch -m a échoué :',
			err instanceof Error ? err.message : err,
		);
		return false;
	}
}

/**
 * Déplace le dossier du worktree vers `<parent>/<newName>` via `git worktree move`,
 * exécuté depuis la racine du repo principal. Retourne le nouveau chemin, ou null
 * en cas d'échec (dossier existant, lock…) — dégradation douce, la branche garde
 * son nouveau nom.
 */
export function moveWorktreeDir(worktreePath: string, newName: string): string | null {
	const root = mainRepoRoot(worktreePath);
	if (!root) return null;
	const dest = join(dirname(worktreePath), newName.replace(/\//g, '-'));
	if (dest === worktreePath) return worktreePath;
	if (existsSync(dest)) {
		console.warn('[autoRename] worktree move ignoré, destination existante :', dest);
		return null;
	}
	try {
		execFileSync('git', ['-C', root, 'worktree', 'move', worktreePath, dest], {
			timeout: 30_000,
			stdio: 'ignore',
		});
		return dest;
	} catch (err) {
		console.warn(
			'[autoRename] git worktree move a échoué :',
			err instanceof Error ? err.message : err,
		);
		return null;
	}
}

// ── Persistance ──

export function persistBranch(sessionDbId: string, branch: string): void {
	const d = getDb();
	if (!d) return;
	try {
		d.prepare('UPDATE agent_sessions SET branch = ? WHERE id = ?').run(branch, sessionDbId);
	} catch {
		/* best-effort */
	}
}

export function persistWorktreePath(sessionDbId: string, worktreePath: string): void {
	const d = getDb();
	if (!d) return;
	try {
		d.prepare('UPDATE agent_sessions SET worktree_path = ? WHERE id = ?').run(
			worktreePath,
			sessionDbId,
		);
	} catch {
		/* best-effort */
	}
}

// ── Orchestration : phase 1 (branche, immédiate) ──

/**
 * Génère un nom depuis la première demande du transcript et renomme la BRANCHE
 * immédiatement (le dossier bouge plus tard, à un moment idle). Retourne le
 * nouveau nom, ou null si rien n'a été renommé (l'appelant retentera).
 */
export async function autoRenameBranch(
	sessionId: string,
	row: SessionRow,
	run?: (prompt: string) => Promise<string>,
): Promise<string | null> {
	if (!isAutoNamed(row.branch) || !row.worktree_path) return null;
	const text = readFirstUserText(sessionId);
	if (!text) return null;

	const slug = await generateBranchSlug(text, run);
	if (!slug) return null;

	const unique = dedupeSlug(slug, (n) => localBranchExists(row.worktree_path!, n));
	if (!unique || unique === row.branch) return null;

	if (!renameBranchInWorktree(row.worktree_path, unique)) return null;
	persistBranch(row.id, unique);
	return unique;
}
