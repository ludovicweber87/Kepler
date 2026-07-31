import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { personas, personaFolderLinks } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

/** Construit la map persona_id → folder_ids[] à partir de la table de liaison. */
function folderIdsByPersona(): Map<string, string[]> {
	const links = db.select().from(personaFolderLinks).all();
	const map = new Map<string, string[]>();
	for (const l of links) {
		const arr = map.get(l.persona_id) ?? [];
		arr.push(l.folder_id);
		map.set(l.persona_id, arr);
	}
	return map;
}

/** Réécrit les liens d'une persona (delete + insert). Ignore les ids vides. */
function setPersonaFolders(personaId: string, folderIds: string[]) {
	db.delete(personaFolderLinks).where(eq(personaFolderLinks.persona_id, personaId)).run();
	for (const folderId of folderIds) {
		if (!folderId) continue;
		db.insert(personaFolderLinks).values({ persona_id: personaId, folder_id: folderId }).run();
	}
}

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const byPersona = folderIdsByPersona();
		const id = req.nextUrl.searchParams.get('id');
		if (id) {
			const row = db.select().from(personas).where(eq(personas.id, id)).get();
			if (!row) return NextResponse.json(null);
			return NextResponse.json({ ...row, folder_ids: byPersona.get(row.id) ?? [] });
		}
		const rows = db
			.select()
			.from(personas)
			.orderBy(asc(personas.name))
			.all()
			.map((row) => ({ ...row, folder_ids: byPersona.get(row.id) ?? [] }));
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

		const folderIds = Array.isArray(body.folder_ids) ? body.folder_ids : [];
		if (folderIds.length) setPersonaFolders(row.id, folderIds);

		return NextResponse.json({ ...row, folder_ids: folderIds });
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
		const { id, created_at: _c, updated_at: _u, folder_ids: folderIds, ...updates } = body;
		if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

		const [row] = db
			.update(personas)
			.set({ ...updates, updated_at: new Date().toISOString() })
			.where(eq(personas.id, id))
			.returning()
			.all();
		if (!row) return NextResponse.json(null);

		if (Array.isArray(folderIds)) setPersonaFolders(id, folderIds);

		const links = db
			.select()
			.from(personaFolderLinks)
			.where(eq(personaFolderLinks.persona_id, id))
			.all();
		return NextResponse.json({ ...row, folder_ids: links.map((l) => l.folder_id) });
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

		db.delete(personaFolderLinks).where(eq(personaFolderLinks.persona_id, id)).run();
		db.delete(personas).where(eq(personas.id, id)).run();
		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
