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

interface ScheduleRow {
	id: string;
	repo_full_name: string;
	time: string;
	last_run_date: string | null;
}

function tick() {
	const db = getDb();
	if (!db) return;
	const today = localDate();
	const now = localHHMM();

	let schedules: ScheduleRow[];
	try {
		schedules = db
			.prepare(
				'SELECT id, repo_full_name, time, last_run_date FROM recap_schedules WHERE enabled = 1',
			)
			.all() as ScheduleRow[];
	} catch {
		return; // table not migrated yet
	}

	for (const s of schedules) {
		if (s.last_run_date === today) continue; // already ran today
		if (now < s.time) continue; // not time yet (fires on/after, so it catches up on boot)
		try {
			generateRecap(s.repo_full_name, today, 'scheduled');
			db.prepare('UPDATE recap_schedules SET last_run_date = ? WHERE id = ?').run(
				today,
				s.id,
			);
			console.log(
				`[devora-agent] rapport planifié généré pour ${s.repo_full_name} (créneau ${s.time})`,
			);
		} catch (err) {
			console.error(
				'[devora-agent] échec rapport planifié:',
				err instanceof Error ? err.message : err,
			);
		}
	}
}

export function startRecapScheduler() {
	setInterval(tick, TICK_MS);
	// Catch-up shortly after boot (server may start after a scheduled time).
	setTimeout(tick, 5_000);
	console.log('[devora-agent] scheduler de rapports démarré');
}
