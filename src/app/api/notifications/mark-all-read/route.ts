import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { isNull, sql } from 'drizzle-orm';

export async function POST() {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		db.update(notifications)
			.set({ read_at: sql`datetime('now')` })
			.where(isNull(notifications.read_at))
			.run();

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
