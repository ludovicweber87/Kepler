import { NextResponse } from "next/server";
import {
  fetchUserLogin,
  fetchUserRepos,
  fetchAssignedIssues,
  fetchProjectColumns,
  fetchSpecificIssues,
} from "@/lib/github";
import { DashboardData, ViewIssueRef } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [user, repos, issues] = await Promise.all([
      fetchUserLogin(),
      fetchUserRepos(),
      fetchAssignedIssues(),
    ]);

    const nodeIds = issues.map((i) => i.node_id).filter(Boolean);
    const columnsMap = await fetchProjectColumns(nodeIds);

    const enrichedIssues = issues.map((issue) => ({
      ...issue,
      project_columns: columnsMap.get(issue.node_id) ?? [],
    }));

    const data: DashboardData = { repos, issues: enrichedIssues, user };
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const refs: ViewIssueRef[] = body.issues;

    if (!Array.isArray(refs) || refs.length === 0) {
      return NextResponse.json({ error: "issues array required" }, { status: 400 });
    }

    const [user, issues] = await Promise.all([
      fetchUserLogin(),
      fetchSpecificIssues(refs),
    ]);

    const nodeIds = issues.map((i) => i.node_id).filter(Boolean);
    const columnsMap = await fetchProjectColumns(nodeIds);

    const enrichedIssues = issues.map((issue) => ({
      ...issue,
      project_columns: columnsMap.get(issue.node_id) ?? [],
    }));

    const data: DashboardData = { repos: [], issues: enrichedIssues, user };
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
