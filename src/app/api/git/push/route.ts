import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function POST(req: NextRequest) {
	try {
		const { cwd, branch } = (await req.json()) as {
			cwd: string;
			branch: string;
		};

		if (!cwd || !branch) {
			return NextResponse.json({ error: 'cwd and branch required' }, { status: 400 });
		}

		const output = execSync(`git push -u origin ${branch}`, {
			cwd,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout: 30_000,
		});

		return NextResponse.json({ ok: true, output });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
