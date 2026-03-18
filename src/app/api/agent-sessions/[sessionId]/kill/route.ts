import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { createServiceRoleClient } from '@/lib/supabase';

function findTmux(): string {
	const paths = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux'];
	for (const p of paths) {
		try {
			execSync(`test -x ${p}`, { stdio: 'ignore' });
			return p;
		} catch {
			/* continue */
		}
	}
	return 'tmux';
}

const TMUX = findTmux();

export async function POST(
	_req: NextRequest,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	const { sessionId } = await params;

	try {
		// 1. Kill shell companion tmux session (if exists)
		try {
			execSync(`${TMUX} kill-session -t ${sessionId}-shell`, { stdio: 'ignore' });
		} catch {
			// Shell session might not exist — that's fine
		}

		// 2. Kill main tmux session
		try {
			execSync(`${TMUX} kill-session -t ${sessionId}`, { stdio: 'ignore' });
		} catch {
			// Session might already be dead — that's fine
		}

		// 3. Update DB: mark as completed + set ended_at
		const supabase = createServiceRoleClient();
		await supabase
			.from('agent_sessions')
			.update({
				status: 'completed',
				ended_at: new Date().toISOString(),
			})
			.eq('session_id', sessionId);

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
