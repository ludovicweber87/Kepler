import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { inArray, sql } from 'drizzle-orm';

export async function PATCH(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { ids } = (await req.json()) as { ids?: string[] };

		if (!Array.isArray(ids) || ids.length === 0) {
			return NextResponse.json({ ok: true, updated: 0 });
		}

		db.update(notifications)
			.set({ read_at: sql`datetime('now')` })
			.where(inArray(notifications.id, ids))
			.run();

		return NextResponse.json({ ok: true, updated: ids.length });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
