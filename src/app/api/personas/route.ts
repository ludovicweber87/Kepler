import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { personas } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const id = req.nextUrl.searchParams.get('id');
		if (id) {
			const row = db.select().from(personas).where(eq(personas.id, id)).get();
			return NextResponse.json(row ?? null);
		}
		const rows = db.select().from(personas).orderBy(asc(personas.name)).all();
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
		const body = await req.json();
		if (!body?.name || typeof body.name !== 'string') {
			return NextResponse.json({ error: 'name required' }, { status: 400 });
		}
		const [row] = db
			.insert(personas)
			.values({
				name: body.name,
				role: body.role ?? '',
				system_prompt: body.system_prompt ?? '',
				model: body.model ?? null,
				effort: body.effort ?? null,
				permission_mode: body.permission_mode ?? null,
				color: body.color ?? null,
			})
			.returning()
			.all();
		return NextResponse.json(row);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const { id, created_at: _c, updated_at: _u, ...updates } = body;
		if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

		const [row] = db
			.update(personas)
			.set({ ...updates, updated_at: new Date().toISOString() })
			.where(eq(personas.id, id))
			.returning()
			.all();
		return NextResponse.json(row ?? null);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function DELETE(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { searchParams } = req.nextUrl;
		const id = searchParams.get('id');
		if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

		db.delete(personas).where(eq(personas.id, id)).run();
		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
