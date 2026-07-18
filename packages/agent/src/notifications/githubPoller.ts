import { getDb } from '../db.js';
import { getLocalGithubToken } from '../helpers.js';
import { insertAndEmit } from './insert.js';
import { diffGithubState, type GithubState, type PrSnapshot } from './diff.js';

const GH = 'https://api.github.com';
const DEFAULT_INTERVAL = 60_000;
const MAX_INTERVAL = 300_000;
const BOOT_DELAY = 3_000;

function ghHeaders(token: string) {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
}

function watchedRepos(): string[] {
	const db = getDb();
	if (!db) return [];
	const rows = db.prepare('SELECT repo_full_name FROM repo_paths').all() as {
		repo_full_name: string;
	}[];
	return rows.map((r) => r.repo_full_name).filter((r) => r.includes('/'));
}

/**
 * Dérive le review decision d'une PR depuis /pulls/{n}/reviews : la REST list `/pulls`
 * ne l'expose pas directement. On prend le dernier review "décisif" (APPROVED ou
 * CHANGES_REQUESTED) de la liste — les reviews REST sont renvoyées par ordre
 * chronologique croissant, donc le dernier élément décisif = le plus récent.
 */
function latestDecisiveReview(
	reviews: Array<{ state: string }>,
): PrSnapshot['reviewDecision'] {
	for (let i = reviews.length - 1; i >= 0; i--) {
		const state = reviews[i].state;
		if (state === 'APPROVED' || state === 'CHANGES_REQUESTED') return state;
	}
	return null;
}

async function fetchReviewDecision(
	token: string,
	owner: string,
	name: string,
	number: number,
): Promise<PrSnapshot['reviewDecision']> {
	try {
		const res = await fetch(`${GH}/repos/${owner}/${name}/pulls/${number}/reviews?per_page=100`, {
			headers: ghHeaders(token),
		});
		if (!res.ok) return null;
		const reviews = (await res.json()) as Array<{ state: string }>;
		return latestDecisiveReview(reviews);
	} catch {
		return null;
	}
}

interface FetchResult {
	state: GithubState;
	pollIntervalMs: number | null;
	rateLimited: boolean;
}

async function fetchState(token: string): Promise<FetchResult> {
	const state: GithubState = { prs: {}, threads: {} };
	let pollIntervalMs: number | null = null;
	let rateLimited = false;

	// GitHub notifications (mentions / review_requested)
	const nres = await fetch(`${GH}/notifications`, { headers: ghHeaders(token) });
	if (nres.status === 403 || nres.status === 429) {
		rateLimited = true;
	} else if (nres.ok) {
		const pollHeader = nres.headers.get('x-poll-interval');
		if (pollHeader) {
			const seconds = parseInt(pollHeader, 10);
			if (!Number.isNaN(seconds)) pollIntervalMs = seconds * 1000;
		}
		const threads = (await nres.json()) as Array<Record<string, any>>;
		for (const t of threads) {
			const id = String(t.id);
			state.threads[id] = {
				id,
				reason: t.reason,
				title: t.subject?.title ?? '',
				url: t.subject?.url ?? t.repository?.html_url ?? '',
				repo: t.repository?.full_name ?? '',
			};
		}
	}

	// Open PRs + checks + review decision, per watched repo
	for (const repo of watchedRepos()) {
		const [owner, name] = repo.split('/');
		if (!owner || !name) continue;
		const pres = await fetch(`${GH}/repos/${owner}/${name}/pulls?state=open&per_page=30`, {
			headers: ghHeaders(token),
		});
		if (pres.status === 403 || pres.status === 429) {
			rateLimited = true;
			continue;
		}
		if (!pres.ok) continue;
		const prs = (await pres.json()) as Array<Record<string, any>>;
		for (const pr of prs) {
			const sha = pr.head?.sha ?? '';
			let checkStatus: PrSnapshot['checkStatus'] = null;
			const cres = await fetch(`${GH}/repos/${owner}/${name}/commits/${sha}/check-runs`, {
				headers: ghHeaders(token),
			});
			if (cres.status === 403 || cres.status === 429) {
				rateLimited = true;
			} else if (cres.ok) {
				const { check_runs = [] } = (await cres.json()) as {
					check_runs: Array<{ status: string; conclusion: string | null }>;
				};
				if (check_runs.length) {
					if (check_runs.some((c) => c.conclusion === 'failure' || c.conclusion === 'timed_out'))
						checkStatus = 'failure';
					else if (check_runs.some((c) => c.status !== 'completed')) checkStatus = 'pending';
					else checkStatus = 'success';
				}
			}

			const reviewDecision = await fetchReviewDecision(token, owner, name, pr.number);

			state.prs[`${repo}#${pr.number}`] = {
				repo,
				number: pr.number,
				url: pr.html_url,
				title: pr.title,
				headSha: sha,
				checkStatus,
				reviewDecision,
				merged: !!pr.merged_at,
			};
		}
	}

	return { state, pollIntervalMs, rateLimited };
}

export function startGithubPoller(): () => void {
	let prev: GithubState = { prs: {}, threads: {} };
	let stopped = false;
	let timer: ReturnType<typeof setTimeout>;

	async function tick() {
		if (stopped) return;
		let interval = DEFAULT_INTERVAL;
		try {
			const token = getLocalGithubToken();
			if (token) {
				const { state: next, pollIntervalMs, rateLimited } = await fetchState(token);
				if (pollIntervalMs) interval = Math.min(MAX_INTERVAL, Math.max(DEFAULT_INTERVAL, pollIntervalMs));
				if (rateLimited) {
					console.warn('[notifications] github poller rate-limited, backing off');
				} else {
					const delta = diffGithubState(prev, next);
					const db = getDb();
					for (const n of delta) insertAndEmit(db, n); // INSERT OR IGNORE absorbe les doublons au boot
					if (db) prev = next;
				}
			}
		} catch (err) {
			console.error('[notifications] github poller tick failed', err);
		} finally {
			if (!stopped) timer = setTimeout(tick, interval);
		}
	}

	timer = setTimeout(tick, BOOT_DELAY); // léger délai au boot (laisse Next créer le schéma)
	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}
