import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { tasks } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const repo = req.nextUrl.searchParams.get('repo');

		const rows = repo
			? db
					.select()
					.from(tasks)
					.where(eq(tasks.repo_full_name, repo))
					.orderBy(desc(tasks.created_at))
					.all()
			: db.select().from(tasks).orderBy(desc(tasks.created_at)).all();

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
		if (!body?.title || typeof body.title !== 'string') {
			return NextResponse.json({ error: 'title required' }, { status: 400 });
		}

		const [row] = db
			.insert(tasks)
			.values({
				title: body.title,
				description: body.description ?? null,
				due_date: body.due_date ?? null,
				repo_full_name: body.repo_full_name ?? null,
				issue_owner: body.issue_owner ?? null,
				issue_repo: body.issue_repo ?? null,
				issue_number: body.issue_number ?? null,
				issue_title: body.issue_title ?? null,
				pinned: body.pinned ?? false,
			})
			.returning()
			.all();

		return NextResponse.json(row, { status: 201 });
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
		const fields = [
			'title',
			'description',
			'due_date',
			'repo_full_name',
			'issue_owner',
			'issue_repo',
			'issue_number',
			'issue_title',
			'done',
			'pinned',
		] as const;

		for (const field of fields) {
			if (field in body) updates[field] = body[field];
		}

		// Règle métier completed_at, pilotée par le passage de `done`.
		if ('done' in body) {
			updates.completed_at = body.done ? new Date().toISOString() : null;
		}

		updates.updated_at = new Date().toISOString();

		const [row] = db.update(tasks).set(updates).where(eq(tasks.id, id)).returning().all();

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
		const id = req.nextUrl.searchParams.get('id');
		if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

		db.delete(tasks).where(eq(tasks.id, id)).run();

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
