import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { todos } from '@/db/schema';
import { eq, and, like } from 'drizzle-orm';

export async function POST(req: NextRequest) {
	try {
		const { issueRepo, issueNumber } = await req.json();

		if (!issueRepo || issueNumber == null) {
			return NextResponse.json({ error: 'issueRepo and issueNumber required' }, { status: 400 });
		}

		// First try: linked todos
		const linked = db
			.update(todos)
			.set({ done: true })
			.where(
				and(
					eq(todos.issue_repo, issueRepo),
					eq(todos.issue_number, issueNumber),
					eq(todos.done, false),
				),
			)
			.returning({ id: todos.id })
			.all();

		// Fallback: match by title pattern "#123 ..."
		if (linked.length === 0) {
			db.update(todos)
				.set({ done: true })
				.where(
					and(
						eq(todos.repo_full_name, issueRepo),
						like(todos.title, `#${issueNumber} %`),
						eq(todos.done, false),
					),
				)
				.run();
		}

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
