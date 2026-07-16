import { test } from 'node:test';
import assert from 'node:assert';
import { runDueSchedules, type ScheduleRow } from './scheduler.js';

function ctxBase(schedules: ScheduleRow[]) {
	const marked: Array<{ id: string; date: string }> = [];
	const generated: Array<{ repo: string; date: string }> = [];
	return {
		marked,
		generated,
		ctx: {
			now: '17:30',
			today: '2026-07-16',
			schedules,
			inFlight: new Set<string>(),
			generate: async (repo: string, date: string) => {
				generated.push({ repo, date });
			},
			markRun: (id: string, date: string) => marked.push({ id, date }),
		},
	};
}

test('déclenche un créneau dû et marque last_run_date après génération', async () => {
	const { ctx, marked, generated } = ctxBase([
		{ id: 's1', repo_full_name: 'org/repo', time: '17:25', last_run_date: null },
	]);
	const ran = await runDueSchedules(ctx);
	assert.deepEqual(ran, ['s1']);
	assert.deepEqual(generated, [{ repo: 'org/repo', date: '2026-07-16' }]);
	assert.deepEqual(marked, [{ id: 's1', date: '2026-07-16' }]);
});

test('ignore un créneau déjà lancé aujourd\'hui', async () => {
	const { ctx, generated } = ctxBase([
		{ id: 's1', repo_full_name: 'org/repo', time: '17:25', last_run_date: '2026-07-16' },
	]);
	const ran = await runDueSchedules(ctx);
	assert.deepEqual(ran, []);
	assert.deepEqual(generated, []);
});

test('ignore un créneau pas encore dû', async () => {
	const { ctx } = ctxBase([
		{ id: 's1', repo_full_name: 'org/repo', time: '23:00', last_run_date: null },
	]);
	const ran = await runDueSchedules(ctx);
	assert.deepEqual(ran, []);
});

test('ne marque pas last_run_date si la génération échoue', async () => {
	const marked: Array<{ id: string; date: string }> = [];
	const errors: unknown[] = [];
	const ran = await runDueSchedules({
		now: '17:30',
		today: '2026-07-16',
		schedules: [{ id: 's1', repo_full_name: 'org/repo', time: '17:25', last_run_date: null }],
		inFlight: new Set(),
		generate: async () => {
			throw new Error('boom');
		},
		markRun: (id, date) => marked.push({ id, date }),
		error: (_m, e) => errors.push(e),
	});
	assert.deepEqual(ran, []);
	assert.deepEqual(marked, []);
	assert.equal(errors.length, 1);
});

test('ignore un créneau déjà en cours (in-flight)', async () => {
	const inFlight = new Set<string>(['s1']);
	const generated: string[] = [];
	const ran = await runDueSchedules({
		now: '17:30',
		today: '2026-07-16',
		schedules: [{ id: 's1', repo_full_name: 'org/repo', time: '17:25', last_run_date: null }],
		inFlight,
		generate: async (repo) => {
			generated.push(repo);
		},
		markRun: () => {},
	});
	assert.deepEqual(ran, []);
	assert.deepEqual(generated, []);
});
