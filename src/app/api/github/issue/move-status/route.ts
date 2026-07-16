import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projectConfigs } from '@/db/schema';
import {
	fetchIssue,
	fetchStatusFieldInfo,
	findProjectItemId,
	updateProjectItemStatus,
} from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { resolveConfigForRepo } from '@/lib/repoIssueBoard';

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { owner, repo, issueNumber, newStatus } = (await req.json()) as {
			owner: string;
			repo: string;
			issueNumber: number;
			newStatus: string;
		};

		if (!owner || !repo || !issueNumber || !newStatus) {
			return NextResponse.json(
				{ error: 'owner, repo, issueNumber and newStatus required' },
				{ status: 400 },
			);
		}

		// Find the project config that contains this repo in its view_repo_mappings.
		const repoFullName = `${owner}/${repo}`;
		const allConfigs = db
			.select({
				org: projectConfigs.org,
				project_number: projectConfigs.project_number,
				view_repo_mappings: projectConfigs.view_repo_mappings,
			})
			.from(projectConfigs)
			.all();

		const normalized = (allConfigs ?? []).map((c) => ({
			org: c.org,
			projectNumber: c.project_number,
			viewRepoMappings: (c.view_repo_mappings as { repos?: string[] }[] | null) ?? [],
		}));

		const config = resolveConfigForRepo(repoFullName, normalized) ?? normalized[0];

		if (!config) {
			return NextResponse.json({ error: 'No project config found' }, { status: 404 });
		}

		const issue = await fetchIssue(owner, repo, issueNumber, auth.accessToken);
		const fieldInfo = await fetchStatusFieldInfo(
			config.org,
			config.projectNumber,
			auth.accessToken,
		);
		const option = fieldInfo.options.find((o) => o.name === newStatus);
		if (!option) {
			return NextResponse.json(
				{ error: `Status "${newStatus}" not found in project` },
				{ status: 400 },
			);
		}

		const itemId = await findProjectItemId(
			issue.node_id,
			fieldInfo.projectId,
			auth.accessToken,
		);
		await updateProjectItemStatus(
			fieldInfo.projectId,
			itemId,
			fieldInfo.fieldId,
			option.id,
			auth.accessToken,
		);

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
