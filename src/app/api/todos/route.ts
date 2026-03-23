import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { todos } from '@/db/schema';
import { eq, and, sql, asc, like } from 'drizzle-orm';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = req.nextUrl;
	const repo = searchParams.get('repo');
	const countOnly = searchParams.get('countOnly') === 'true';
	const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
	const issueRepo = searchParams.get('issueRepo');
	const issueNumber = searchParams.get('issueNumber');

	try {
		if (countOnly) {
			const [result] = db
				.select({ count: sql<number>`count(*)` })
				.from(todos)
				.where(eq(todos.done, false))
				.all();
			return NextResponse.json({ count: result.count });
		}

		if (issueRepo && issueNumber) {
			const rows = db
				.select()
				.from(todos)
				.where(
					and(
						eq(todos.issue_repo, issueRepo),
						eq(todos.issue_number, parseInt(issueNumber)),
					),
				)
				.all();
			return NextResponse.json(rows);
		}

		let query = db
			.select()
			.from(todos)
			.orderBy(asc(todos.sort_order), asc(todos.created_at));

		if (repo) {
			query = query.where(eq(todos.repo_full_name, repo)) as typeof query;
		}

		let rows = query.all();

		if (limit) {
			rows = rows.slice(0, limit);
		}

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
		const { repo_full_name, title, sort_order = 0, issue_number, issue_repo } = body;

		const [row] = db
			.insert(todos)
			.values({
				repo_full_name,
				title,
				sort_order,
				issue_number: issue_number ?? null,
				issue_repo: issue_repo ?? null,
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
		const { id, ...updates } = body;

		if (!id) {
			return NextResponse.json({ error: 'id required' }, { status: 400 });
		}

		const [row] = db
			.update(todos)
			.set(updates)
			.where(eq(todos.id, id))
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

		if (!id) {
			return NextResponse.json({ error: 'id required' }, { status: 400 });
		}

		db.delete(todos).where(eq(todos.id, id)).run();

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
