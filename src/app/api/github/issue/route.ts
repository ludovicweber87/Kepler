import { NextRequest, NextResponse } from "next/server";
import { fetchIssue, fetchIssueComments } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const number = searchParams.get("number");

  if (!owner || !repo || !number) {
    return NextResponse.json(
      { error: "Missing owner, repo, or number" },
      { status: 400 }
    );
  }

  const num = parseInt(number, 10);

  try {
    const [issue, comments] = await Promise.all([
      fetchIssue(owner, repo, num),
      fetchIssueComments(owner, repo, num),
    ]);
    return NextResponse.json({ issue, comments });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
