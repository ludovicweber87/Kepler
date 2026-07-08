import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agentSessions, agentActivityLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { maybeAutoRenameBranch } from '@/lib/autoRenameBranch';

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const {
			sessionId,
			content,
			logType = 'summary',
			branch,
			status,
		} = body as {
			sessionId: string;
			content: string;
			logType?: string;
			branch?: string;
			status?: string;
		};

		if (!sessionId || !content) {
			return NextResponse.json({ error: 'sessionId and content required' }, { status: 400 });
		}

		// Look up existing session
		const session = db
			.select({
				id: agentSessions.id,
				session_id: agentSessions.session_id,
				project_name: agentSessions.project_name,
				agent_name: agentSessions.agent_name,
				branch: agentSessions.branch,
				worktree_path: agentSessions.worktree_path,
				issue_owner: agentSessions.issue_owner,
				issue_repo: agentSessions.issue_repo,
				issue_number: agentSessions.issue_number,
				issue_title: agentSessions.issue_title,
			})
			.from(agentSessions)
			.where(eq(agentSessions.session_id, sessionId))
			.get();

		if (!session) {
			return NextResponse.json({ ok: true, skipped: true });
		}

		// Handle "title" log type — update agent_name (+ auto-name the worktree branch)
		if (logType === 'title') {
			const title = content.slice(0, 80).trim();
			if (title) {
				db.update(agentSessions)
					.set({ agent_name: title })
					.where(eq(agentSessions.id, session.id))
					.run();
			}
			maybeAutoRenameBranch(session, content);
			return NextResponse.json({ ok: true });
		}

		// Insert activity log
		db.insert(agentActivityLogs)
			.values({
				agent_session_id: session.id,
				content,
				log_type: logType,
			})
			.run();

		// First real activity → rename an auto-generated `wip-` worktree branch (graceful)
		maybeAutoRenameBranch(session, content);

		// Update branch and status
		const updates: Record<string, unknown> = {};
		if (branch) updates.branch = branch;
		if (status && status !== 'active') {
			updates.status = status;
			if (status === 'completed' || status === 'error') {
				updates.ended_at = new Date().toISOString();
			}
		}
		if (Object.keys(updates).length > 0) {
			db.update(agentSessions).set(updates).where(eq(agentSessions.id, session.id)).run();
		}

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
