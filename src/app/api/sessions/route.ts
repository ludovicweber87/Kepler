import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { getActiveSessions } from '@/lib/terminal-server';
import { createServiceRoleClient } from '@/lib/supabase';

export interface ActiveSession {
	sessionId: string;
	cwd: string;
	branch: string | null;
	projectName: string;
	agentName: string | null;
	createdAt: number;
	lastActivity: number;
	lastOutput: number;
	isActive: boolean;
	isStreaming: boolean;
}

function getGitBranch(cwd: string): string | null {
	if (!cwd) return null;
	try {
		return execSync('git rev-parse --abbrev-ref HEAD', {
			cwd,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return null;
	}
}

/** Turn a branch name like "feat/123-qa-list" into "Feat 123 Qa List" */
function branchToLabel(branch: string): string {
	return branch
		.replace(/^(feat|fix|refactor|docs|chore|test|perf)\//, '$1 ')
		.replace(/[-_/]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveAgentName(sessionId: string, branch: string | null): string | null {
	if (branch && branch !== 'main' && branch !== 'master') {
		return branchToLabel(branch);
	}
	const base = sessionId.replace('devora-', '');
	const parts = base.split('-');
	const last = parts[parts.length - 1];
	if (/^\d+$/.test(last)) return null;
	return last === 'session' ? null : last;
}

interface DbSession {
	session_id: string;
	branch: string | null;
	agent_name: string | null;
}

export async function GET() {
	try {
		const supabase = createServiceRoleClient();
		const metas = getActiveSessions();
		const sessionIds = metas.map((m) => m.sessionId);

		// Fetch stored data from DB — this is the source of truth per session
		const dbMap = new Map<string, DbSession>();
		if (sessionIds.length > 0) {
			const { data } = await supabase
				.from('agent_sessions')
				.select('session_id, branch, agent_name')
				.in('session_id', sessionIds);
			for (const row of data ?? []) {
				dbMap.set(row.session_id, row);
			}
		}

		// Sessions without a branch in DB: snapshot git branch once and persist it
		const toBackfill: { sessionId: string; branch: string }[] = [];

		const sessions: ActiveSession[] = metas.map((meta) => {
			const db = dbMap.get(meta.sessionId);
			let branch = db?.branch ?? null;

			// If DB has no branch yet, read git ONCE and queue for backfill
			if (!branch) {
				const gitBranch = getGitBranch(meta.cwd);
				if (gitBranch && gitBranch !== 'main' && gitBranch !== 'master') {
					branch = gitBranch;
					toBackfill.push({ sessionId: meta.sessionId, branch: gitBranch });
				}
			}

			return {
				sessionId: meta.sessionId,
				cwd: meta.cwd,
				branch,
				projectName: meta.cwd.split('/').filter(Boolean).pop() ?? 'unknown',
				agentName: db?.agent_name ?? deriveAgentName(meta.sessionId, branch),
				createdAt: meta.createdAt,
				lastActivity: meta.lastActivity,
				lastOutput: meta.lastOutput,
				isActive: true,
				isStreaming: meta.hasRecentOutput,
			};
		});

		// Persist branch snapshots so they never change again
		for (const { sessionId, branch } of toBackfill) {
			supabase
				.from('agent_sessions')
				.update({ branch })
				.eq('session_id', sessionId)
				.is('branch', null)
				.then();
		}

		sessions.sort((a, b) => b.createdAt - a.createdAt);

		return NextResponse.json({ sessions });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
