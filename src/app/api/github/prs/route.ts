import { NextRequest, NextResponse } from "next/server";
import { fetchRepoPullRequests } from "@/lib/github";

export async function GET(req: NextRequest) {
  try {
    const repos = req.nextUrl.searchParams.get("repos");
    if (!repos) {
      return NextResponse.json({ error: "repos parameter required" }, { status: 400 });
    }

    const repoList = repos.split(",").map((r) => r.trim()).filter(Boolean);
    const results = await Promise.allSettled(
      repoList.map((repo) => {
        const [owner, name] = repo.split("/");
        return fetchRepoPullRequests(owner, name, "open");
      })
    );

    const prs = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchRepoPullRequests>>> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // Sort by updated_at desc
    prs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return NextResponse.json({ prs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
