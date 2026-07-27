import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { docs, docCategoryLinks } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { DocWithCategories } from '@/types';

/** Construit la map doc_id → category_ids[] à partir de la table de liaison. */
function categoryIdsByDoc(): Map<string, string[]> {
	const links = db.select().from(docCategoryLinks).all();
	const map = new Map<string, string[]>();
	for (const l of links) {
		const arr = map.get(l.doc_id) ?? [];
		arr.push(l.category_id);
		map.set(l.doc_id, arr);
	}
	return map;
}

/** Remplace l'ensemble des catégories liées à une doc. */
function setDocCategories(docId: string, categoryIds: string[]) {
	db.delete(docCategoryLinks).where(eq(docCategoryLinks.doc_id, docId)).run();
	for (const categoryId of categoryIds) {
		if (!categoryId) continue;
		db.insert(docCategoryLinks).values({ doc_id: docId, category_id: categoryId }).run();
	}
}

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const id = req.nextUrl.searchParams.get('id');
		const byDoc = categoryIdsByDoc();

		if (id) {
			const row = db.select().from(docs).where(eq(docs.id, id)).get();
			if (!row) return NextResponse.json(null);
			const enriched = { ...row, category_ids: byDoc.get(row.id) ?? [] } as DocWithCategories;
			return NextResponse.json(enriched);
		}

		const rows = db.select().from(docs).orderBy(desc(docs.created_at)).all();
		const enriched = rows.map(
			(row) => ({ ...row, category_ids: byDoc.get(row.id) ?? [] }) as DocWithCategories,
		);
		return NextResponse.json(enriched);
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
		if (!body?.subject || typeof body.subject !== 'string') {
			return NextResponse.json({ error: 'subject required' }, { status: 400 });
		}

		const [row] = db
			.insert(docs)
			.values({
				title: body.title?.trim() || body.subject.trim(),
				subject: body.subject.trim(),
				source_type: body.source_type ?? 'knowledge',
				repo_full_name: body.repo_full_name ?? null,
				level: body.level ?? 'intermediate',
				length: body.length ?? 'medium',
				format: body.format ?? 'overview',
				angle: body.angle ?? null,
				status: 'queued',
			})
			.returning()
			.all();

		if (Array.isArray(body.category_ids)) {
			setDocCategories(row.id, body.category_ids);
		}

		return NextResponse.json(
			{ ...row, category_ids: body.category_ids ?? [] },
			{ status: 201 },
		);
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
		const { id } = body;
		if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

		const updates: Record<string, unknown> = {};
		const fields = ['title', 'content', 'status', 'error', 'angle'] as const;
		for (const field of fields) {
			if (field in body) updates[field] = body[field];
		}

		if (Array.isArray(body.category_ids)) {
			setDocCategories(id, body.category_ids);
		}

		let row = db.select().from(docs).where(eq(docs.id, id)).get() ?? null;
		if (Object.keys(updates).length > 0) {
			updates.updated_at = new Date().toISOString();
			[row] = db.update(docs).set(updates).where(eq(docs.id, id)).returning().all();
		}

		if (!row) return NextResponse.json(null);
		const links = db
			.select()
			.from(docCategoryLinks)
			.where(eq(docCategoryLinks.doc_id, id))
			.all();
		return NextResponse.json({ ...row, category_ids: links.map((l) => l.category_id) });
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

		db.delete(docCategoryLinks).where(eq(docCategoryLinks.doc_id, id)).run();
		db.delete(docs).where(eq(docs.id, id)).run();

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
