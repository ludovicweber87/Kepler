import { NextRequest, NextResponse } from "next/server";
import { fetchStatusFieldInfo, findProjectItemId, updateProjectItemStatus } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const { issueNodeId, newStatus, org, projectNumber } = await request.json();

    if (!issueNodeId || !newStatus || !org || !projectNumber) {
      return NextResponse.json(
        { error: "Missing required fields: issueNodeId, newStatus, org, projectNumber" },
        { status: 400 }
      );
    }

    const fieldInfo = await fetchStatusFieldInfo(org, projectNumber);

    const option = fieldInfo.options.find((o) => o.name === newStatus);
    if (!option) {
      return NextResponse.json(
        { error: `Status "${newStatus}" not found in project` },
        { status: 400 }
      );
    }

    const itemId = await findProjectItemId(issueNodeId, fieldInfo.projectId);

    await updateProjectItemStatus(fieldInfo.projectId, itemId, fieldInfo.fieldId, option.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
