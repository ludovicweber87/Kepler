import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, content, logType = "summary", branch, status } = body as {
      sessionId: string;
      content: string;
      logType?: string;
      branch?: string;
      status?: string;
    };

    if (!sessionId || !content) {
      return NextResponse.json({ error: "sessionId and content required" }, { status: 400 });
    }

    // Upsert session if it doesn't exist yet
    const projectName = sessionId
      .replace("devora-", "")
      .split("-")
      .slice(0, -1)
      .join("-") || "unknown";

    const { data: session } = await supabase
      .from("agent_sessions")
      .upsert(
        {
          session_id: sessionId,
          project_path: "",
          project_name: projectName,
          branch: branch ?? null,
          status: status ?? "active",
        },
        { onConflict: "session_id" }
      )
      .select("id")
      .single();

    if (!session) {
      return NextResponse.json({ error: "Failed to upsert session" }, { status: 500 });
    }

    // Update branch and status if provided
    const updates: Record<string, unknown> = {};
    if (branch) updates.branch = branch;
    if (status) {
      updates.status = status;
      if (status === "completed" || status === "error") {
        updates.ended_at = new Date().toISOString();
      }
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("agent_sessions").update(updates).eq("id", session.id);
    }

    // Insert activity log
    const { error: logError } = await supabase.from("agent_activity_logs").insert({
      agent_session_id: session.id,
      content,
      log_type: logType,
    });

    if (logError) {
      return NextResponse.json({ error: logError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
