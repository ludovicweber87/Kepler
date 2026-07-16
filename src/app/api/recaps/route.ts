import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { dailyRecaps } from '@/db/schema';
import { and, eq, like, asc, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { searchParams } = req.nextUrl;
		const repo = searchParams.get('repo');
		const month = searchParams.get('month'); // YYYY-MM
		if (!repo) return NextResponse.json({ error: 'repo required' }, { status: 400 });

		const conditions = [eq(dailyRecaps.repo_full_name, repo)];
		if (month) conditions.push(like(dailyRecaps.recap_date, `${month}%`));

		const rows = db
			.select()
			.from(dailyRecaps)
			.where(and(...conditions))
			.orderBy(asc(dailyRecaps.recap_date), desc(dailyRecaps.created_at))
			.all();

		return NextResponse.json(rows);
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

		db.delete(dailyRecaps).where(eq(dailyRecaps.id, id)).run();
		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
