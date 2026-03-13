import { NextRequest, NextResponse } from 'next/server';
import { fetchStatusFieldInfo, findProjectItemId, updateProjectItemStatus } from '@/lib/github';
import { requireAuth, isAuthError } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { issueNodeId, newStatus, org, projectNumber, ownerType } = await request.json();

		if (!issueNodeId || !newStatus || !org || !projectNumber) {
			return NextResponse.json(
				{ error: 'Missing required fields: issueNodeId, newStatus, org, projectNumber' },
				{ status: 400 },
			);
		}

		const fieldInfo = await fetchStatusFieldInfo(org, projectNumber, auth.accessToken, ownerType ?? 'organization');

		const option = fieldInfo.options.find((o) => o.name === newStatus);
		if (!option) {
			return NextResponse.json(
				{ error: `Status "${newStatus}" not found in project` },
				{ status: 400 },
			);
		}

		const itemId = await findProjectItemId(issueNodeId, fieldInfo.projectId, auth.accessToken);

		await updateProjectItemStatus(fieldInfo.projectId, itemId, fieldInfo.fieldId, option.id, auth.accessToken);

		return NextResponse.json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
