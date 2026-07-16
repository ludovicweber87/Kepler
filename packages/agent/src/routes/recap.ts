import { IncomingMessage, ServerResponse } from 'node:http';
import { execSync, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readBody, sendJson, sendError, findGh } from '../helpers.js';
import { getDb } from '../db.js';
import { buildRecapPrompt, runRecapAgent } from '../sdk/recapAgent.js';

export interface RecapItem {
	time: string; // HH:MM local
	type: string; // commit | pr | summary | file_change | info | error | ask_question
	text: string;
}

export interface GeneratedRecap {
	id: string;
	repo_full_name: string;
	recap_date: string;
	content: string;
	items: RecapItem[];
	trigger_type: string;
	created_at: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function localTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function repoLocalPath(repoFullName: string): string | null {
	const db = getDb();
	if (!db) return null;
	const row = db
		.prepare('SELECT local_path FROM repo_paths WHERE lower(repo_full_name) = lower(?)')
		.get(repoFullName) as { local_path?: string } | undefined;
	return row?.local_path ?? null;
}

function collectGitCommits(localPath: string, date: string): RecapItem[] {
	try {
		const raw = execSync(
			`git -C ${JSON.stringify(localPath)} log --all --no-merges ` +
				`--since=${JSON.stringify(`${date} 00:00:00`)} ` +
				`--until=${JSON.stringify(`${date} 23:59:59`)} ` +
				`--format='%aI|%s|%an' -n 200`,
			{ encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] },
		);
		return raw
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const [iso, message, author] = line.split('|');
				return {
					time: localTime(iso?.trim() ?? ''),
					type: 'commit',
					text: `${message?.trim() ?? ''}${author ? ` (${author.trim()})` : ''}`,
				};
			});
	} catch {
		return [];
	}
}

function collectPullRequests(repoFullName: string, date: string): RecapItem[] {
	const gh = findGh();
	const items: RecapItem[] = [];
	const run = (search: string, verb: string) => {
		try {
			const out = execFileSync(
				gh,
				[
					'pr',
					'list',
					'--repo',
					repoFullName,
					'--state',
					'all',
					'--search',
					search,
					'--json',
					'number,title,url,createdAt,mergedAt,state',
					'--limit',
					'50',
				],
				{ encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'ignore'] },
			);
			const prs = JSON.parse(out) as Array<{
				number: number;
				title: string;
				createdAt: string;
				mergedAt: string | null;
			}>;
			for (const pr of prs) {
				const stamp = verb === 'mergée' ? pr.mergedAt : pr.createdAt;
				items.push({
					time: localTime(stamp ?? pr.createdAt),
					type: 'pr',
					text: `PR ${verb} #${pr.number} — ${pr.title}`,
				});
			}
		} catch {
			/* gh absent / non authentifié / repo introuvable — best effort */
		}
	};
	run(`created:${date}`, 'ouverte');
	run(`merged:${date}`, 'mergée');
	return items;
}

function collectActivityLogs(
	localPath: string | null,
	repoFullName: string,
	date: string,
): RecapItem[] {
	const db = getDb();
	if (!db) return [];
	// Match sessions by their worktree/project path (worktrees live under localPath)
	// or, as a fallback, by the issue repo they were launched from.
	const rows = db
		.prepare(
			`SELECT l.content AS content, l.log_type AS log_type, l.created_at AS created_at
			 FROM agent_activity_logs l
			 JOIN agent_sessions s ON s.id = l.agent_session_id
			 WHERE date(l.created_at, 'localtime') = :date
			   AND l.log_type != 'ask_question'
			   AND (
			     (:prefix IS NOT NULL AND s.project_path LIKE :prefix)
			     OR lower(s.issue_owner || '/' || s.issue_repo) = lower(:repo)
			   )
			 ORDER BY l.created_at ASC
			 LIMIT 300`,
		)
		.all({
			date,
			prefix: localPath ? `${localPath}%` : null,
			repo: repoFullName,
		}) as Array<{ content: string; log_type: string; created_at: string }>;
	return rows.map((r) => ({
		time: localTime(r.created_at),
		type: r.log_type,
		text: (r.content ?? '').slice(0, 600),
	}));
}

/**
 * Produit le contenu markdown du rapport via l'Agent SDK (headless).
 * Si le dépôt n'a pas de chemin local ET qu'aucune activité n'a été collectée,
 * l'agent ne pourrait rien explorer → on court-circuite avec le placeholder.
 */
async function synthesize(
	repoFullName: string,
	date: string,
	items: RecapItem[],
	localPath: string | null,
): Promise<string> {
	if (!localPath && items.length === 0) {
		return '_Aucune activité enregistrée pour ce jour._';
	}
	const prompt = buildRecapPrompt(repoFullName, date, items);
	const content = await runRecapAgent({
		cwd: localPath ?? process.cwd(),
		prompt,
	});
	return content || '_Rapport indisponible._';
}

/**
 * Génère (et persiste) un rapport quotidien pour un dépôt et une date locale.
 * Réutilisé par la route manuelle et par le scheduler.
 */
export async function generateRecap(
	repoFullName: string,
	date: string,
	triggerType: 'manual' | 'scheduled',
): Promise<GeneratedRecap> {
	if (!YMD.test(date)) throw new Error('date must be YYYY-MM-DD');
	const db = getDb();
	if (!db) throw new Error('Database not available');

	const localPath = repoLocalPath(repoFullName);
	const items = [
		...collectActivityLogs(localPath, repoFullName, date),
		...(localPath ? collectGitCommits(localPath, date) : []),
		...collectPullRequests(repoFullName, date),
	].sort((a, b) => a.time.localeCompare(b.time));

	const content = await synthesize(repoFullName, date, items, localPath);

	const id = randomUUID();
	const created_at = new Date().toISOString();
	db.prepare(
		`INSERT INTO daily_recaps (id, repo_full_name, recap_date, content, items, trigger_type, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
	).run(id, repoFullName, date, content, JSON.stringify(items), triggerType, created_at);

	return {
		id,
		repo_full_name: repoFullName,
		recap_date: date,
		content,
		items,
		trigger_type: triggerType,
		created_at,
	};
}

export async function handleRecapRoutes(req: IncomingMessage, res: ServerResponse, path: string) {
	const method = req.method ?? 'GET';

	if (path === '/recap/generate' && method === 'POST') {
		try {
			const { repoFullName, date } = await readBody<{
				repoFullName?: string;
				date?: string;
			}>(req);
			if (!repoFullName) return sendJson(res, { error: 'repoFullName required' }, 400);
			const day = date ?? new Date().toLocaleDateString('en-CA'); // en-CA => YYYY-MM-DD local
			const recap = await generateRecap(repoFullName, day, 'manual');
			sendJson(res, { recap });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}

	sendJson(res, { error: 'Not found' }, 404);
}
