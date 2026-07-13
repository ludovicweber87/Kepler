import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { projectConfigs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET() {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const rows = db.select().from(projectConfigs).all();
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
		const body = await req.json();
		const {
			org,
			project_number,
			project_title,
			selected_views,
			active_view,
			view_order,
			view_repo_mappings,
			status_columns,
			views,
			owner_type,
			connected,
		} = body;

		// Upsert by org + project_number
		const existing = db
			.select()
			.from(projectConfigs)
			.where(
				and(
					eq(projectConfigs.org, org),
					eq(projectConfigs.project_number, project_number),
				),
			)
			.get();

		const values = {
			org,
			project_number,
			project_title,
			selected_views,
			active_view,
			view_order,
			view_repo_mappings,
			status_columns,
			views,
			owner_type,
			connected: connected ?? false,
		};

		if (existing) {
			db.update(projectConfigs)
				.set(values)
				.where(eq(projectConfigs.id, existing.id))
				.run();
		} else {
			db.insert(projectConfigs).values(values).run();
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
		const all = searchParams.get('all') === 'true';
		const org = searchParams.get('org');
		const projectNumber = searchParams.get('project_number');

		if (all) {
			db.delete(projectConfigs).run();
		} else if (org && projectNumber) {
			db.delete(projectConfigs)
				.where(
					and(
						eq(projectConfigs.org, org),
						eq(projectConfigs.project_number, parseInt(projectNumber)),
					),
				)
				.run();
		} else {
			return NextResponse.json({ error: 'org+project_number or all=true required' }, { status: 400 });
		}

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
