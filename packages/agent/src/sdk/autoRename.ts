import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { basename, dirname, join, isAbsolute } from 'node:path';
import { findClaude, cleanClaudeEnv } from '../helpers.js';
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

/** Types conventionnels retirés en tête de slug avant humanisation. */
const SLUG_TYPE_PREFIX = /^(feat|fix|docs|refactor|test|chore)-/;

/**
 * Transforme un slug de branche en label lisible pour la sidebar : retire le
 * préfixe de type conventionnel puis met en forme (`feat-add-login` →
 * `Add login`). Retourne `''` si rien d'exploitable.
 */
export function humanizeBranchSlug(slug: string): string {
	const words = slug
		.replace(SLUG_TYPE_PREFIX, '')
		.split('-')
		.filter(Boolean);
	const joined = words.join(' ');
	if (!joined) return '';
	return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Prompt LLM (anglais) : synthèse de la première demande → slug de branche. */
export function buildBranchNamePrompt(firstRequest: string, assistantMessage?: string): string {
	const base = `You are given the first request a developer sent to a coding agent. Infer the actual TASK and produce a git branch slug that summarizes it.
STRICT format: <type>-<keywords> where <type> is one of feat, fix, docs, refactor, test, chore and <keywords> is 1 to 4 meaningful English words in kebab-case.
Rules:
- English ONLY. Translate if the request is written in another language.
- Lowercase letters, digits and hyphens only.
- Pick MEANINGFUL words (the domain and the action), never filler words or greetings.
- Ignore chit-chat, politeness and irrelevant context.
- Reply with ONLY the slug — no quotes, no punctuation, no explanation.

Request:
${firstRequest.slice(0, 1500)}`;
	const assistant = assistantMessage?.trim();
	if (!assistant) return base;
	return `${base}

Agent's initial response (context only):
${assistant.slice(0, 800)}`;
}

async function defaultRun(prompt: string): Promise<string> {
	const CLAUDE_BIN = findClaude();
	// Même env nettoyé que le chemin SDK : laisser fuiter les `ANTHROPIC_*` du
	// serveur casse l'auth du sous-process (cause de l'échec silencieux du rename).
	const { stdout } = await execFileAsync(CLAUDE_BIN, ['--print', '--model', 'haiku', prompt], {
		timeout: 30_000,
		maxBuffer: 1024 * 512,
		env: cleanClaudeEnv(),
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
	assistantMessage?: string,
): Promise<string | null> {
	try {
		const out = await run(buildBranchNamePrompt(firstRequest, assistantMessage));
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

/** Premier event d'un type donné dans le transcript, texte extrait ou null. */
function readFirstEventText(sessionId: string, eventType: 'user' | 'assistant'): string | null {
	const d = getDb();
	if (!d) return null;
	try {
		const row = d
			.prepare(
				'SELECT content FROM agent_chat_messages WHERE agent_session_id = ? AND event_type = ? ORDER BY seq ASC LIMIT 1',
			)
			.get(sessionId, eventType) as { content: string } | undefined;
		if (!row) return null;
		const parsed = JSON.parse(row.content) as { data?: { text?: string } };
		const text = parsed.data?.text?.trim();
		return text || null;
	} catch {
		return null;
	}
}

/** Premier message user du transcript — la « première demande » qui nomme la branche. */
export function readFirstUserText(sessionId: string): string | null {
	return readFirstEventText(sessionId, 'user');
}

/** Première réponse de l'agent — contexte optionnel pour affiner le nom (façon Orca). */
export function readFirstAssistantText(sessionId: string): string | null {
	return readFirstEventText(sessionId, 'assistant');
}

/** Label humain courant de la session (`agent_name`), ou null. */
export function readAgentName(sessionDbId: string): string | null {
	const d = getDb();
	if (!d) return null;
	try {
		const row = d
			.prepare('SELECT agent_name FROM agent_sessions WHERE id = ?')
			.get(sessionDbId) as { agent_name: string | null } | undefined;
		return row?.agent_name?.trim() || null;
	} catch {
		return null;
	}
}

/** Écrit le label humain de la session (best-effort). */
export function persistAgentName(sessionDbId: string, name: string): void {
	const d = getDb();
	if (!d) return;
	try {
		d.prepare('UPDATE agent_sessions SET agent_name = ? WHERE id = ?').run(name, sessionDbId);
	} catch {
		/* best-effort */
	}
}

// ── Opérations git ──

/**
 * Seam d'exécution git injectable (pour les tests) : renvoie stdout, throw si la
 * commande échoue (code ≠ 0). L'implémentation par défaut appelle `git -C <wt>`.
 */
export type GitExec = (args: string[]) => string;

export function defaultGitExec(worktreePath: string): GitExec {
	return (args) =>
		execFileSync('git', ['-C', worktreePath, ...args], {
			encoding: 'utf-8',
			timeout: 10_000,
		}).toString();
}

/** Nom de la branche courante (`HEAD`), ou null si détaché/illisible. */
export function currentBranchName(exec: GitExec): string | null {
	try {
		const name = exec(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
		return name && name !== 'HEAD' ? name : null;
	} catch {
		return null;
	}
}

/**
 * La branche courante a-t-elle un upstream (déjà poussée) ? True si oui → on ne
 * renomme jamais une branche publiée (garde façon Orca). L'échec de la commande
 * (`@{upstream}` absent) signifie « pas d'upstream » → false.
 */
export function branchHasUpstream(exec: GitExec): boolean {
	try {
		exec(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
		return true;
	} catch {
		return false;
	}
}

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
 * Verdict structuré de l'auto-rename : `renamed` (branche renommée),
 * `skip` (inéligible de façon définitive), `retry` (échec transitoire, on
 * retentera au prochain tour). `reason` alimente les logs de l'appelant.
 */
export interface AutoRenameVerdict {
	outcome: 'renamed' | 'skip' | 'retry';
	reason: string;
	newName?: string;
	displayName?: string;
}

/**
 * Génère un nom depuis la première demande du transcript et renomme la BRANCHE
 * immédiatement (le dossier bouge plus tard, à un moment idle). Garde-fous façon
 * Orca : jamais une branche déjà poussée, re-validation après génération. Écrit
 * aussi un label humain (`agent_name`) s'il est vide. Retourne un verdict que
 * l'appelant loggue et exploite (`newName` seulement si `outcome === 'renamed'`).
 */
export async function autoRenameBranch(
	sessionId: string,
	row: SessionRow,
	opts?: { run?: (prompt: string) => Promise<string>; gitExec?: GitExec },
): Promise<AutoRenameVerdict> {
	if (!isAutoNamed(row.branch) || !row.worktree_path) {
		return { outcome: 'skip', reason: 'branch is not auto-named' };
	}
	const worktreePath = row.worktree_path;
	const gitExec = opts?.gitExec ?? defaultGitExec(worktreePath);

	// Gate : ne jamais renommer une branche déjà publiée.
	if (branchHasUpstream(gitExec)) {
		return { outcome: 'skip', reason: 'branch has upstream' };
	}

	const text = readFirstUserText(sessionId);
	if (!text) return { outcome: 'retry', reason: 'no first user text yet' };
	const assistant = readFirstAssistantText(sessionId) ?? undefined;

	const slug = await generateBranchSlug(text, opts?.run, assistant);
	if (!slug) return { outcome: 'retry', reason: 'slug generation failed' };

	const unique = dedupeSlug(slug, (n) => localBranchExists(worktreePath, n));
	if (!unique || unique === row.branch) {
		return { outcome: 'skip', reason: `no distinct name for slug "${slug}"` };
	}

	// Re-validation après les ~8s de génération : la branche n'a pas changé et
	// n'a pas été poussée entre-temps.
	const branchNow = currentBranchName(gitExec);
	if (branchNow !== row.branch) {
		return { outcome: 'retry', reason: `branch changed during generation (${branchNow})` };
	}
	if (branchHasUpstream(gitExec)) {
		return { outcome: 'retry', reason: 'branch pushed during generation' };
	}

	if (!renameBranchInWorktree(worktreePath, unique)) {
		return { outcome: 'retry', reason: 'git branch -m failed' };
	}
	persistBranch(row.id, unique);

	// Label sidebar humanisé, uniquement si aucun label (persona/issue) déjà posé.
	const displayName = humanizeBranchSlug(unique);
	if (displayName && !readAgentName(row.id)) {
		persistAgentName(row.id, displayName);
		return { outcome: 'renamed', reason: 'ok', newName: unique, displayName };
	}
	return { outcome: 'renamed', reason: 'ok', newName: unique };
}
