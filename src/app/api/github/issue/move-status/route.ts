import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
	fetchIssue,
	fetchStatusFieldInfo,
	findProjectItemId,
	updateProjectItemStatus,
} from '@/lib/github';

export async function POST(req: NextRequest) {
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

		// Get project config from DB
		const { data: config } = await supabase
			.from('project_configs')
			.select('org, project_number')
			.limit(1)
			.single();

		if (!config) {
			return NextResponse.json({ error: 'No project config found' }, { status: 404 });
		}

		// Get issue node_id from GitHub
		const issue = await fetchIssue(owner, repo, issueNumber);

		// Get project field info + move
		const fieldInfo = await fetchStatusFieldInfo(config.org, config.project_number);
		const option = fieldInfo.options.find((o) => o.name === newStatus);
		if (!option) {
			return NextResponse.json(
				{ error: `Status "${newStatus}" not found in project` },
				{ status: 400 },
			);
		}

		const itemId = await findProjectItemId(issue.node_id, fieldInfo.projectId);
		await updateProjectItemStatus(fieldInfo.projectId, itemId, fieldInfo.fieldId, option.id);

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
