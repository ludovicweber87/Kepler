import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { repoScripts } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { nextSortOrder } from '@/lib/repoScripts';
import { REPO_SCRIPT_RUN_MODES, type RepoScriptRunMode } from '@/types';

function isRunMode(v: unknown): v is RepoScriptRunMode {
	return typeof v === 'string' && (REPO_SCRIPT_RUN_MODES as string[]).includes(v);
}

function fail(err: unknown) {
	const message = err instanceof Error ? err.message : 'Unknown error';
	return NextResponse.json({ error: message }, { status: 500 });
}

// GET /api/repo-scripts?repo=owner/repo → les scripts du repo, triés
export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const repo = req.nextUrl.searchParams.get('repo');
	if (!repo) return NextResponse.json({ error: 'repo required' }, { status: 400 });

	try {
		const rows = db
			.select()
			.from(repoScripts)
			.where(eq(repoScripts.repo_full_name, repo))
			.orderBy(asc(repoScripts.sort_order), asc(repoScripts.created_at))
			.all();
		return NextResponse.json(rows);
	} catch (err) {
		return fail(err);
	}
}

// POST /api/repo-scripts { repo_full_name, name, script, run_mode }
export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const repo = body.repo_full_name;
		if (!repo || typeof repo !== 'string') {
			return NextResponse.json({ error: 'repo_full_name required' }, { status: 400 });
		}
		const run_mode = body.run_mode ?? 'terminal';
		if (!isRunMode(run_mode)) {
			return NextResponse.json({ error: 'invalid run_mode' }, { status: 400 });
		}

		const existing = db
			.select({ sort_order: repoScripts.sort_order })
			.from(repoScripts)
			.where(eq(repoScripts.repo_full_name, repo))
			.all();

		const [row] = db
			.insert(repoScripts)
			.values({
				repo_full_name: repo,
				name: body.name ?? '',
				script: body.script ?? '',
				run_mode,
				sort_order: nextSortOrder(existing.map((s) => ({ sort_order: s.sort_order ?? 0 }))),
			})
			.returning()
			.all();
		return NextResponse.json(row ?? null);
	} catch (err) {
		return fail(err);
	}
}

// PATCH /api/repo-scripts { id, name?, script?, run_mode? }
export async function PATCH(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const id = body.id;
		if (!id || typeof id !== 'string') {
			return NextResponse.json({ error: 'id required' }, { status: 400 });
		}
		if (body.run_mode !== undefined && !isRunMode(body.run_mode)) {
			return NextResponse.json({ error: 'invalid run_mode' }, { status: 400 });
		}

		const patch: Record<string, unknown> = {};
		if (typeof body.name === 'string') patch.name = body.name;
		if (typeof body.script === 'string') patch.script = body.script;
		if (body.run_mode !== undefined) patch.run_mode = body.run_mode;
		if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;

		if (Object.keys(patch).length === 0) {
			return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
		}

		const [row] = db
			.update(repoScripts)
			.set(patch)
			.where(eq(repoScripts.id, id))
			.returning()
			.all();
		if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
		return NextResponse.json(row);
	} catch (err) {
		return fail(err);
	}
}

// DELETE /api/repo-scripts?id=…
export async function DELETE(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const id = req.nextUrl.searchParams.get('id');
	if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

	try {
		db.delete(repoScripts).where(eq(repoScripts.id, id)).run();
		return NextResponse.json({ ok: true });
	} catch (err) {
		return fail(err);
	}
}
