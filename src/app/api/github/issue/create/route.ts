import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projectConfigs } from '@/db/schema';
import {
	createIssue,
	fetchStatusFieldInfo,
	addProjectV2ItemById,
	updateProjectItemStatus,
} from '@/lib/github';
import { resolveConfigForRepo } from '@/lib/repoIssueBoard';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

interface CreateIssueBody {
	owner: string;
	repo: string;
	title: string;
	body?: string;
	labels?: string[];
	assignees?: string[];
	milestone?: number | null;
	status?: string | null;
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { owner, repo, title, body, labels, assignees, milestone, status } =
			(await req.json()) as CreateIssueBody;

		if (!owner || !repo || !title?.trim()) {
			return NextResponse.json(
				{ error: 'owner, repo and title are required' },
				{ status: 400 },
			);
		}

		// Le board ne montre que les issues assignées à l'utilisateur courant :
		// à défaut d'assignee explicite, on s'auto-assigne pour qu'elle y apparaisse.
		const finalAssignees = assignees && assignees.length > 0 ? assignees : [auth.login];

		const issue = await createIssue(
			owner,
			repo,
			{
				title: title.trim(),
				body,
				labels,
				assignees: finalAssignees,
				milestone: milestone ?? undefined,
			},
			auth.accessToken,
		);

		// Optionally add the fresh issue to the covering Project V2 board and set its column.
		let boardWarning: string | null = null;
		if (status) {
			try {
				const connected = (
					db
						.select({
							org: projectConfigs.org,
							project_number: projectConfigs.project_number,
							owner_type: projectConfigs.owner_type,
							view_repo_mappings: projectConfigs.view_repo_mappings,
							connected: projectConfigs.connected,
						})
						.from(projectConfigs)
						.all() ?? []
				)
					.filter((c) => c.connected)
					.map((c) => ({
						org: c.org,
						projectNumber: c.project_number,
						ownerType: (c.owner_type ?? undefined) as
							| 'organization'
							| 'user'
							| undefined,
						viewRepoMappings:
							(c.view_repo_mappings as { repos?: string[] }[] | null) ?? [],
					}));

				const covering = resolveConfigForRepo(`${owner}/${repo}`, connected);
				if (!covering) {
					boardWarning = 'no_covering_project';
				} else {
					const fieldInfo = await fetchStatusFieldInfo(
						covering.org,
						covering.projectNumber,
						auth.accessToken,
						covering.ownerType ?? 'organization',
					);
					const option = fieldInfo.options.find((o) => o.name === status);
					const itemId = await addProjectV2ItemById(
						fieldInfo.projectId,
						issue.node_id,
						auth.accessToken,
					);
					if (option) {
						await updateProjectItemStatus(
							fieldInfo.projectId,
							itemId,
							fieldInfo.fieldId,
							option.id,
							auth.accessToken,
						);
					} else {
						boardWarning = 'status_not_found';
					}
				}
			} catch (boardErr) {
				// The issue exists; only the board placement failed. Surface as a warning.
				boardWarning = boardErr instanceof Error ? boardErr.message : 'board_add_failed';
			}
		}

		return NextResponse.json({
			ok: true,
			number: issue.number,
			html_url: issue.html_url,
			boardWarning,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
