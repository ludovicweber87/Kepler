import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET(req: NextRequest) {
  const localPath = req.nextUrl.searchParams.get("path");
  const branch = req.nextUrl.searchParams.get("branch");
  if (!localPath || !branch) {
    return NextResponse.json({ error: "path and branch required" }, { status: 400 });
  }

  try {
    const raw = execSync(
      `git -C ${JSON.stringify(localPath)} log ${JSON.stringify(branch)} --format='%H|%h|%s|%an|%ai' -n 30`,
      { encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "ignore"] }
    );

    const commits = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, message, author, date] = line.split("|");
        return {
          hash: hash?.trim() ?? "",
          shortHash: shortHash?.trim() ?? "",
          message: message?.trim() ?? "",
          author: author?.trim() ?? "",
          date: date?.trim() ?? "",
        };
      });

    return NextResponse.json({ commits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
