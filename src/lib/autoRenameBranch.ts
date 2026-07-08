import { execSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';

const CLAUDE_BIN = process.env.CLAUDE_BIN || '/opt/homebrew/bin/claude';

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
 * If a session's worktree still has an auto-generated `wip-` branch, synthesize a
 * Karma-convention name from the agent's activity and rename the BRANCH only
 * (`git branch -m`, directory untouched → safe while the session runs).
 *
 * Fire-and-forget and fully guarded: any failure just leaves the `wip-` name — it
 * never breaks the running session or the log endpoint.
 */
export function maybeAutoRenameBranch(
	session: { id: string; branch: string | null; worktree_path: string | null },
	activity: string,
): void {
	if (!session.branch?.startsWith('wip-') || !session.worktree_path) return;
	if (!activity.trim() || inProgress.has(session.id)) return;
	inProgress.add(session.id);

	(async () => {
		try {
			const prompt = `Transforme cette activité d'agent en un nom de branche git court, convention Karma (format: type-en-kebab, ex: "feat-add-google-auth"). Types autorisés: feat, fix, docs, refactor, test, chore. Réponds UNIQUEMENT le nom, sans guillemets ni autre texte.\n\nActivité: ${activity.slice(0, 500)}`;
			const escaped = prompt.replace(/'/g, "'\\''");
			const out = execSync(`${CLAUDE_BIN} --print '${escaped}'`, {
				encoding: 'utf-8',
				timeout: 30_000,
				maxBuffer: 1024 * 1024,
			});
			const newName = toKarmaKebab(out);
			if (!newName || newName === session.branch) return;

			execSync(
				`git -C ${JSON.stringify(session.worktree_path)} branch -m ${JSON.stringify(newName)}`,
				{ stdio: 'ignore' },
			);
			db.update(schema.agentSessions)
				.set({ branch: newName })
				.where(eq(schema.agentSessions.id, session.id))
				.run();
		} catch {
			// keep the wip- name — graceful degradation
		} finally {
			inProgress.delete(session.id);
		}
	})();
}
