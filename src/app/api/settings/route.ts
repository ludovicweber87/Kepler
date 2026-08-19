import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { appSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/settings            → { key: value, ... }
// GET /api/settings?key=foo    → { value: string | null }
export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const key = req.nextUrl.searchParams.get('key');
	if (key) {
		const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
		return NextResponse.json({ value: row?.value ?? null });
	}
	const rows = db.select().from(appSettings).all();
	return NextResponse.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

// PUT /api/settings { key, value } → upsert
export async function PUT(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { key, value } = await req.json();
		if (!key || typeof key !== 'string') {
			return NextResponse.json({ error: 'key required' }, { status: 400 });
		}
		const [row] = db
			.insert(appSettings)
			.values({ key, value: value ?? '' })
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: value ?? '', updated_at: new Date().toISOString() },
			})
			.returning()
			.all();
		return NextResponse.json(row ?? null);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
