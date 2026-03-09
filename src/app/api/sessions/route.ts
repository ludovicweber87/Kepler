import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { getActiveSessions } from "@/lib/terminal-server";

export interface ActiveSession {
  sessionId: string;
  cwd: string;
  branch: string | null;
  projectName: string;
  agentName: string | null;
  createdAt: number;
  lastActivity: number;
  lastOutput: number;
  isActive: boolean;
}

function getGitBranch(cwd: string): string | null {
  if (!cwd) return null;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function deriveAgentName(sessionId: string): string | null {
  // sessionId format: devora-{path}-{agent} or devora-agent-{timestamp}
  const base = sessionId.replace("devora-", "");
  const parts = base.split("-");
  const last = parts[parts.length - 1];
  // If it's a pure number (old timestamp sessions), no agent name
  if (/^\d+$/.test(last)) return null;
  return last === "session" ? null : last;
}

export async function GET() {
  try {
    const metas = getActiveSessions();

    const sessions: ActiveSession[] = metas.map((meta) => ({
      sessionId: meta.sessionId,
      cwd: meta.cwd,
      branch: getGitBranch(meta.cwd),
      projectName: meta.cwd.split("/").filter(Boolean).pop() ?? "unknown",
      agentName: deriveAgentName(meta.sessionId),
      createdAt: meta.createdAt,
      lastActivity: meta.lastActivity,
      lastOutput: meta.lastOutput,
      isActive: meta.hasRecentOutput,
    }));

    // Sort by most recent first
    sessions.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
