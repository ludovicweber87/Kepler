import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { desc, isNull, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = req.nextUrl;

	try {
		if (searchParams.get('count') === '1') {
			const row = db
				.select({ c: sql<number>`count(*)` })
				.from(notifications)
				.where(isNull(notifications.read_at))
				.get();
			return NextResponse.json({ unread: row?.c ?? 0 });
		}

		const limit = Math.max(1, Math.min(Number(searchParams.get('limit')) || 50, 200));

		const rows =
			searchParams.get('unread') === '1'
				? db
						.select()
						.from(notifications)
						.where(isNull(notifications.read_at))
						.orderBy(desc(notifications.created_at))
						.limit(limit)
						.all()
				: db.select().from(notifications).orderBy(desc(notifications.created_at)).limit(limit).all();

		return NextResponse.json(rows);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
