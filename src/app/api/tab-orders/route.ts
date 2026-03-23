import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { tabOrders } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { searchParams } = req.nextUrl;
		const group = searchParams.get('group');

		if (!group) {
			return NextResponse.json({ error: 'group required' }, { status: 400 });
		}

		const row = db
			.select()
			.from(tabOrders)
			.where(eq(tabOrders.tab_group, group))
			.get();

		return NextResponse.json({ tab_order: row?.tab_order ?? [] });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function PUT(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { tab_group, tab_order } = await req.json();

		if (!tab_group) {
			return NextResponse.json({ error: 'tab_group required' }, { status: 400 });
		}

		const existing = db
			.select()
			.from(tabOrders)
			.where(eq(tabOrders.tab_group, tab_group))
			.get();

		if (existing) {
			db.update(tabOrders)
				.set({ tab_order, updated_at: new Date().toISOString() })
				.where(eq(tabOrders.tab_group, tab_group))
				.run();
		} else {
			db.insert(tabOrders)
				.values({ tab_group, tab_order, updated_at: new Date().toISOString() })
				.run();
		}

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
