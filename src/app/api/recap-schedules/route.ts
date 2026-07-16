import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { recapSchedules } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const repo = req.nextUrl.searchParams.get('repo');
		if (!repo) return NextResponse.json({ error: 'repo required' }, { status: 400 });

		const rows = db
			.select()
			.from(recapSchedules)
			.where(eq(recapSchedules.repo_full_name, repo))
			.orderBy(asc(recapSchedules.time))
			.all();

		return NextResponse.json(rows);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { repo_full_name, time } = await req.json();
		if (!repo_full_name || !HHMM.test(time ?? '')) {
			return NextResponse.json(
				{ error: 'repo_full_name and time (HH:MM) required' },
				{ status: 400 },
			);
		}

		// De-duplicate identical (repo, time) schedules.
		const existing = db
			.select()
			.from(recapSchedules)
			.where(
				and(
					eq(recapSchedules.repo_full_name, repo_full_name),
					eq(recapSchedules.time, time),
				),
			)
			.get();
		if (existing) return NextResponse.json(existing);

		const id = crypto.randomUUID();
		db.insert(recapSchedules).values({ id, repo_full_name, time }).run();
		const row = db.select().from(recapSchedules).where(eq(recapSchedules.id, id)).get();
		return NextResponse.json(row);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function DELETE(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const id = req.nextUrl.searchParams.get('id');
		if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

		db.delete(recapSchedules).where(eq(recapSchedules.id, id)).run();
		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
