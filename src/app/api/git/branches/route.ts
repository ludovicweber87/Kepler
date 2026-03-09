import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET(req: NextRequest) {
  const localPath = req.nextUrl.searchParams.get("path");
  if (!localPath) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  try {
    const raw = execSync(
      `git -C ${JSON.stringify(localPath)} branch --format='%(refname:short)|%(committerdate:iso8601)|%(subject)|%(authorname)' --sort=-committerdate`,
      { encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "ignore"] }
    );

    // Get current branch
    let current = "";
    try {
      current = execSync(
        `git -C ${JSON.stringify(localPath)} rev-parse --abbrev-ref HEAD`,
        { encoding: "utf-8", timeout: 5_000, stdio: ["pipe", "pipe", "ignore"] }
      ).trim();
    } catch {
      // ignore
    }

    const branches = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, date, message, author] = line.split("|");
        return {
          name: name.trim(),
          lastCommitDate: date?.trim() ?? "",
          lastCommitMessage: message?.trim() ?? "",
          lastCommitAuthor: author?.trim() ?? "",
          isCurrent: name.trim() === current,
        };
      });

    return NextResponse.json({ branches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
