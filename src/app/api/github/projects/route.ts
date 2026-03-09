import { NextRequest, NextResponse } from "next/server";
import { fetchOrgProjects, fetchProjectV2Data, fetchViewerOrgProjects } from "@/lib/github";
import { mapViewsToRepos } from "@/lib/projectViews";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const org = searchParams.get("org");
    const projectNumber = searchParams.get("projectNumber");

    // No org → auto-discover all orgs + projects for the authenticated user
    if (!org && !projectNumber) {
      const orgProjects = await fetchViewerOrgProjects();
      return NextResponse.json({ orgProjects });
    }

    if (!org) {
      return NextResponse.json({ error: "org parameter is required" }, { status: 400 });
    }

    // org but no project number → list projects for that org
    if (!projectNumber) {
      const projects = await fetchOrgProjects(org);
      return NextResponse.json({ projects });
    }

    // Fetch full project data (views + items) and compute view→repos mappings
    const num = parseInt(projectNumber, 10);
    if (isNaN(num)) {
      return NextResponse.json({ error: "projectNumber must be a number" }, { status: 400 });
    }

    const projectData = await fetchProjectV2Data(org, num);
    const viewRepoMappings = mapViewsToRepos(projectData.views, projectData.items);

    return NextResponse.json({
      project: {
        id: projectData.id,
        title: projectData.title,
        number: projectData.number,
      },
      views: projectData.views,
      viewRepoMappings,
      statusColumns: projectData.statusColumns,
    });
  } catch (err) {
    console.error("Projects API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
