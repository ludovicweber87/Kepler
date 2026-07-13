import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { agentSessions, agentActivityLogs } from '@/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = req.nextUrl;
	const status = searchParams.get('status');
	const branch = searchParams.get('branch');
	const sessionId = searchParams.get('sessionId');
	const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
	const withLogs = searchParams.get('withLogs') === 'true';
	const withLastLog = searchParams.get('withLastLog') === 'true';

	try {
		// Single session by session_id
		if (sessionId) {
			const session = db
				.select()
				.from(agentSessions)
				.where(eq(agentSessions.session_id, sessionId))
				.get();
			return NextResponse.json(session ?? null);
		}

		// Build query conditions
		const conditions = [];
		if (status) {
			if (status === 'completed') {
				conditions.push(inArray(agentSessions.status, ['completed', 'error']));
			} else {
				conditions.push(eq(agentSessions.status, status));
			}
		}
		if (branch) {
			conditions.push(eq(agentSessions.branch, branch));
		}

		let rows = db
			.select()
			.from(agentSessions)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(agentSessions.started_at))
			.all();

		if (limit) {
			rows = rows.slice(0, limit);
		}

		// Attach logs if requested
		if (withLogs && rows.length > 0) {
			const sessionIds = rows.map((r) => r.id);
			const allLogs = db
				.select()
				.from(agentActivityLogs)
				.where(inArray(agentActivityLogs.agent_session_id, sessionIds))
				.all();

			const logsBySession = new Map<string, typeof allLogs>();
			for (const log of allLogs) {
				const list = logsBySession.get(log.agent_session_id) ?? [];
				list.push(log);
				logsBySession.set(log.agent_session_id, list);
			}

			const result = rows.map((s) => ({
				...s,
				logs: logsBySession.get(s.id) ?? [],
			}));
			return NextResponse.json(result);
		}

		// Attach last log only (for pending questions detection)
		if (withLastLog && rows.length > 0) {
			const result = rows.map((s) => {
				const lastLog = db
					.select()
					.from(agentActivityLogs)
					.where(eq(agentActivityLogs.agent_session_id, s.id))
					.orderBy(desc(agentActivityLogs.created_at))
					.limit(1)
					.get();
				return { ...s, lastLog: lastLog ?? null };
			});
			return NextResponse.json(result);
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
		const {
			session_id,
			project_path,
			project_name,
			branch,
			worktree_path,
			agent_name,
			issue_owner,
			issue_repo,
			issue_number,
			issue_title,
			system_prompt,
		} = body;

		// Check if already exists
		const existing = db
			.select()
			.from(agentSessions)
			.where(eq(agentSessions.session_id, session_id))
			.get();

		if (existing) {
			// Backfill issue fields if missing
			if (!existing.issue_number && issue_number) {
				db.update(agentSessions)
					.set({ issue_owner, issue_repo, issue_number, issue_title })
					.where(eq(agentSessions.id, existing.id))
					.run();
				return NextResponse.json({
					...existing,
					issue_owner,
					issue_repo,
					issue_number,
					issue_title,
				});
			}
			return NextResponse.json(existing);
		}

		const [row] = db
			.insert(agentSessions)
			.values({
				session_id,
				project_path,
				project_name,
				branch: branch ?? null,
				worktree_path: worktree_path ?? null,
				agent_name: agent_name ?? null,
				status: 'active',
				issue_owner: issue_owner ?? null,
				issue_repo: issue_repo ?? null,
				issue_number: issue_number ?? null,
				issue_title: issue_title ?? null,
				system_prompt: system_prompt ?? null,
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
		const { id, session_id, ...updates } = body;

		const whereClause = id
			? eq(agentSessions.id, id)
			: session_id
				? eq(agentSessions.session_id, session_id)
				: null;

		if (!whereClause) {
			return NextResponse.json({ error: 'id or session_id required' }, { status: 400 });
		}

		const [row] = db.update(agentSessions).set(updates).where(whereClause).returning().all();

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

		// Delete logs first, then session
		const session = db.select().from(agentSessions).where(eq(agentSessions.id, id)).get();

		if (session) {
			db.delete(agentActivityLogs)
				.where(eq(agentActivityLogs.agent_session_id, session.id))
				.run();
			db.delete(agentSessions).where(eq(agentSessions.id, id)).run();
		}

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
