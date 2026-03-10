import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		const result = execSync(
			`osascript -e 'POSIX path of (choose folder with prompt "Select repository directory")'`,
			{ encoding: 'utf-8', timeout: 60000 },
		).trim();

		// Remove trailing slash
		const path = result.endsWith('/') ? result.slice(0, -1) : result;

		return NextResponse.json({ path });
	} catch {
		// User cancelled the dialog or error
		return NextResponse.json({ path: null });
	}
}
