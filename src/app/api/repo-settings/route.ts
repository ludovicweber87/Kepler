import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { repoSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

function defaults(repo: string) {
	return {
		repo_full_name: repo,
		create_pr_prompt: '',
		commit_push_prompt: '',
		files_to_copy: '',
		setup_script: '',
		setup_script_name: '',
		archive_script: '',
	};
}

// GET /api/repo-settings?repo=owner/repo → the row (or defaults)
export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const repo = req.nextUrl.searchParams.get('repo');
	if (!repo) return NextResponse.json({ error: 'repo required' }, { status: 400 });

	try {
		const row = db
			.select()
			.from(repoSettings)
			.where(eq(repoSettings.repo_full_name, repo))
			.get();
		return NextResponse.json(row ?? defaults(repo));
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

// PUT /api/repo-settings { repo_full_name, create_pr_prompt, files_to_copy, setup_script, setup_script_name, archive_script }
export async function PUT(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const repo = body.repo_full_name;
		if (!repo || typeof repo !== 'string') {
			return NextResponse.json({ error: 'repo_full_name required' }, { status: 400 });
		}
		const values = {
			repo_full_name: repo,
			create_pr_prompt: body.create_pr_prompt ?? '',
			commit_push_prompt: body.commit_push_prompt ?? '',
			files_to_copy: body.files_to_copy ?? '',
			setup_script: body.setup_script ?? '',
			setup_script_name: body.setup_script_name ?? '',
			archive_script: body.archive_script ?? '',
		};
		const [row] = db
			.insert(repoSettings)
			.values(values)
			.onConflictDoUpdate({
				target: repoSettings.repo_full_name,
				set: { ...values, updated_at: new Date().toISOString() },
			})
			.returning()
			.all();
		return NextResponse.json(row ?? null);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
