import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { docCategories, docCategoryLinks } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const rows = db
			.select()
			.from(docCategories)
			.orderBy(asc(docCategories.sort_order), asc(docCategories.created_at))
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
		const body = await req.json();
		if (!body?.name || typeof body.name !== 'string') {
			return NextResponse.json({ error: 'name required' }, { status: 400 });
		}

		const [row] = db
			.insert(docCategories)
			.values({
				name: body.name.trim(),
				color: body.color ?? '#7C5CFF',
				sort_order: body.sort_order ?? 0,
			})
			.returning()
			.all();

		return NextResponse.json(row, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		// Nom unique déjà pris → 409 explicite.
		if (message.includes('UNIQUE')) {
			return NextResponse.json({ error: 'name already exists' }, { status: 409 });
		}
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const { id } = body;
		if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

		const updates: Record<string, unknown> = {};
		for (const field of ['name', 'color', 'sort_order'] as const) {
			if (field in body) updates[field] = body[field];
		}

		const [row] = db
			.update(docCategories)
			.set(updates)
			.where(eq(docCategories.id, id))
			.returning()
			.all();

		return NextResponse.json(row ?? null);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('UNIQUE')) {
			return NextResponse.json({ error: 'name already exists' }, { status: 409 });
		}
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function DELETE(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const id = req.nextUrl.searchParams.get('id');
		if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

		// Supprimer une catégorie ne supprime jamais de doc : on retire seulement
		// les liens. Les docs concernées repassent en « sans catégorie ».
		db.delete(docCategoryLinks).where(eq(docCategoryLinks.category_id, id)).run();
		db.delete(docCategories).where(eq(docCategories.id, id)).run();

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

// Réordonnancement en lot des onglets (drag & drop). Body: { order: string[] }.
export async function PUT(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		if (!Array.isArray(body?.order)) {
			return NextResponse.json({ error: 'order[] required' }, { status: 400 });
		}
		body.order.forEach((id: string, index: number) => {
			db.update(docCategories)
				.set({ sort_order: index })
				.where(eq(docCategories.id, id))
				.run();
		});
		const rows = db
			.select()
			.from(docCategories)
			.orderBy(asc(docCategories.sort_order), asc(docCategories.created_at))
			.all();
		return NextResponse.json(rows);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
