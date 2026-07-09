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

/** Normalize a raw string into a Karma-style kebab branch name (`feat-add-auth`). */
function toKarmaKebab(raw: string): string | null {
	const cleaned = raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s/-]/g, '')
		.replace(/[\s/]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 50)
		.replace(/-+$/, '');
	return cleaned.length >= 3 ? cleaned : null;
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
		const prompt = `Transforme cette demande en un nom de branche git court, convention Karma (format: type-en-kebab, ex: "feat-add-google-auth"). Types autorisés: feat, fix, docs, refactor, test, chore. Réponds UNIQUEMENT le nom, sans guillemets ni autre texte.\n\nDemande: ${text.slice(0, 500)}`;
		const escaped = prompt.replace(/'/g, "'\\''");
		const out = execSync(`${CLAUDE_BIN} --print '${escaped}'`, {
			encoding: 'utf-8',
			timeout: 30_000,
			maxBuffer: 1024 * 1024,
		});
		const newName = toKarmaKebab(out);
		if (!newName || newName === session.branch) return null;

		execSync(
			`git -C ${JSON.stringify(session.worktree_path)} branch -m ${JSON.stringify(newName)}`,
			{ stdio: 'ignore' },
		);
		db.update(schema.agentSessions)
			.set({ branch: newName })
			.where(eq(schema.agentSessions.id, session.id))
			.run();
		return newName;
	} catch {
		// keep the wip- name — graceful degradation
		return null;
	} finally {
		inProgress.delete(session.id);
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
