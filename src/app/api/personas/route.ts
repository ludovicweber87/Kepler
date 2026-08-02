import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { personas, personaRepos } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

/** Construit la map persona_id → repo_full_name[] à partir de la table de liaison. */
function reposByPersona(): Map<string, string[]> {
	const links = db.select().from(personaRepos).all();
	const map = new Map<string, string[]>();
	for (const l of links) {
		const arr = map.get(l.persona_id) ?? [];
		arr.push(l.repo_full_name);
		map.set(l.persona_id, arr);
	}
	return map;
}

/** Réécrit les repos d'une persona (delete + insert). Ignore les valeurs vides. */
function setPersonaRepos(personaId: string, repos: string[]) {
	db.delete(personaRepos).where(eq(personaRepos.persona_id, personaId)).run();
	for (const repo of repos) {
		if (!repo) continue;
		db.insert(personaRepos).values({ persona_id: personaId, repo_full_name: repo }).run();
	}
}

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const byPersona = reposByPersona();
		const id = req.nextUrl.searchParams.get('id');
		if (id) {
			const row = db.select().from(personas).where(eq(personas.id, id)).get();
			if (!row) return NextResponse.json(null);
			return NextResponse.json({ ...row, repos: byPersona.get(row.id) ?? [] });
		}
		const rows = db
			.select()
			.from(personas)
			.orderBy(asc(personas.name))
			.all()
			.map((row) => ({ ...row, repos: byPersona.get(row.id) ?? [] }));
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

		const repos = Array.isArray(body.repos) ? body.repos : [];
		if (repos.length) setPersonaRepos(row.id, repos);

		return NextResponse.json({ ...row, repos });
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
		const { id, created_at: _c, updated_at: _u, repos, ...updates } = body;
		if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

		const [row] = db
			.update(personas)
			.set({ ...updates, updated_at: new Date().toISOString() })
			.where(eq(personas.id, id))
			.returning()
			.all();
		if (!row) return NextResponse.json(null);

		if (Array.isArray(repos)) setPersonaRepos(id, repos);

		const links = db.select().from(personaRepos).where(eq(personaRepos.persona_id, id)).all();
		return NextResponse.json({ ...row, repos: links.map((l) => l.repo_full_name) });
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

		db.delete(personaRepos).where(eq(personaRepos.persona_id, id)).run();
		db.delete(personas).where(eq(personas.id, id)).run();
		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
