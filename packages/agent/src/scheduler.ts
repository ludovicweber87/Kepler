import { getDb } from './db.js';
import { generateRecap } from './routes/recap.js';

const TICK_MS = 60_000;

/** Local calendar date as YYYY-MM-DD (matches the user's machine timezone). */
function localDate(): string {
	return new Date().toLocaleDateString('en-CA');
}

/** Local time as zero-padded HH:MM (24h), safe for string comparison. */
function localHHMM(): string {
	return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export interface ScheduleRow {
	id: string;
	repo_full_name: string;
	time: string;
	last_run_date: string | null;
}

export interface RunDueContext {
	now: string; // HH:MM local
	today: string; // YYYY-MM-DD local
	schedules: ScheduleRow[];
	inFlight: Set<string>;
	generate: (repo: string, date: string) => Promise<unknown> | unknown;
	markRun: (id: string, date: string) => void;
	log?: (msg: string) => void;
	error?: (msg: string, err: unknown) => void;
}

/**
 * Déclenche les créneaux dus (logique pure des effets injectés → testable).
 * Un créneau est dû si : pas déjà lancé aujourd'hui, l'heure est atteinte,
 * et pas déjà en cours. `generate` est attendu (await) pour marquer
 * `last_run_date` seulement après une génération réussie.
 * Retourne les ids effectivement lancés.
 */
export async function runDueSchedules(ctx: RunDueContext): Promise<string[]> {
	const ran: string[] = [];
	for (const s of ctx.schedules) {
		if (s.last_run_date === ctx.today) continue; // déjà lancé aujourd'hui
		if (ctx.now < s.time) continue; // pas encore l'heure (déclenche à/après → rattrapage au boot)
		if (ctx.inFlight.has(s.id)) continue; // génération déjà en cours
		ctx.inFlight.add(s.id);
		try {
			await ctx.generate(s.repo_full_name, ctx.today);
			ctx.markRun(s.id, ctx.today);
			ran.push(s.id);
			ctx.log?.(`rapport planifié généré pour ${s.repo_full_name} (créneau ${s.time})`);
		} catch (err) {
			ctx.error?.('échec rapport planifié', err);
		} finally {
			ctx.inFlight.delete(s.id);
		}
	}
	return ran;
}

const inFlight = new Set<string>();
let ticking = false;

async function tick() {
	if (ticking) return; // évite le chevauchement de ticks (génération SDK longue)
	const db = getDb();
	if (!db) return;

	let schedules: ScheduleRow[];
	try {
		schedules = db
			.prepare(
				'SELECT id, repo_full_name, time, last_run_date FROM recap_schedules WHERE enabled = 1',
			)
			.all() as ScheduleRow[];
	} catch {
		return; // table non migrée
	}
	if (schedules.length === 0) return;

	ticking = true;
	try {
		await runDueSchedules({
			now: localHHMM(),
			today: localDate(),
			schedules,
			inFlight,
			generate: (repo, date) => generateRecap(repo, date, 'scheduled'),
			markRun: (id, date) =>
				db.prepare('UPDATE recap_schedules SET last_run_date = ? WHERE id = ?').run(date, id),
			log: (msg) => console.log(`[devora-agent] ${msg}`),
			error: (msg, err) =>
				console.error(`[devora-agent] ${msg}:`, err instanceof Error ? err.message : err),
		});
	} finally {
		ticking = false;
	}
}

export function startRecapScheduler() {
	setInterval(() => void tick(), TICK_MS);
	// Catch-up shortly after boot (server may start after a scheduled time).
	setTimeout(() => void tick(), 5_000);
	console.log('[devora-agent] scheduler de rapports démarré');
}
