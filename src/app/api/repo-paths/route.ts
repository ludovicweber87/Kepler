import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { repoPaths } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const rows = db
			.select()
			.from(repoPaths)
			.orderBy(asc(repoPaths.repo_full_name))
			.all();

		return NextResponse.json(rows);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function PUT(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { repo_full_name, local_path } = await req.json();

		// Upsert: try update, then insert
		const existing = db
			.select()
			.from(repoPaths)
			.where(eq(repoPaths.repo_full_name, repo_full_name))
			.get();

		if (existing) {
			db.update(repoPaths)
				.set({ local_path })
				.where(eq(repoPaths.repo_full_name, repo_full_name))
				.run();
		} else {
			db.insert(repoPaths)
				.values({ repo_full_name, local_path })
				.run();
		}

		return NextResponse.json({ ok: true });
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
		const repoFullName = searchParams.get('repo_full_name');

		if (!repoFullName) {
			return NextResponse.json({ error: 'repo_full_name required' }, { status: 400 });
		}

		db.delete(repoPaths)
			.where(eq(repoPaths.repo_full_name, repoFullName))
			.run();

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
