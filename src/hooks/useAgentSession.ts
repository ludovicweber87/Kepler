import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AgentSession {
  id: string;
  session_id: string;
  project_path: string;
  project_name: string;
  branch: string | null;
  agent_name: string | null;
  status: "active" | "completed" | "error";
  started_at: string;
  ended_at: string | null;
}

export interface AgentActivityLog {
  id: string;
  agent_session_id: string;
  content: string;
  log_type: "info" | "commit" | "file_change" | "error" | "summary";
  created_at: string;
}

function queryKey(sessionId: string) {
  return ["agent-session", sessionId];
}

async function fetchSession(sessionId: string) {
  const { data, error } = await supabase
    .from("agent_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data as AgentSession | null;
}

async function fetchLogs(agentSessionId: string) {
  const { data, error } = await supabase
    .from("agent_activity_logs")
    .select("*")
    .eq("agent_session_id", agentSessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AgentActivityLog[];
}

export function useAgentSession(sessionId: string | undefined) {
  const qc = useQueryClient();

  const { data: session = null } = useQuery({
    queryKey: queryKey(sessionId ?? ""),
    queryFn: () => fetchSession(sessionId!),
    enabled: !!sessionId,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["agent-session-logs", session?.id],
    queryFn: () => fetchLogs(session!.id),
    enabled: !!session?.id,
    refetchInterval: 10_000,
  });

  const ensureSessionMutation = useMutation({
    mutationFn: async (params: {
      sessionId: string;
      projectPath: string;
      projectName: string;
      branch?: string | null;
      agentName?: string | null;
    }) => {
      // Check if session already exists — don't overwrite status
      const { data: existing } = await supabase
        .from("agent_sessions")
        .select("*")
        .eq("session_id", params.sessionId)
        .maybeSingle();

      if (existing) return existing as AgentSession;

      // Create new session only if it doesn't exist
      const { data, error } = await supabase
        .from("agent_sessions")
        .insert({
          session_id: params.sessionId,
          project_path: params.projectPath,
          project_name: params.projectName,
          branch: params.branch ?? null,
          agent_name: params.agentName ?? null,
          status: "active",
        })
        .select()
        .single();
      if (error) throw error;
      return data as AgentSession;
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKey(data.session_id), data);
    },
  });

  const addLogMutation = useMutation({
    mutationFn: async (params: {
      content: string;
      logType?: AgentActivityLog["log_type"];
    }) => {
      if (!session) throw new Error("No session");
      const { data, error } = await supabase
        .from("agent_activity_logs")
        .insert({
          agent_session_id: session.id,
          content: params.content,
          log_type: params.logType ?? "info",
        })
        .select()
        .single();
      if (error) throw error;
      return data as AgentActivityLog;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-session-logs", session?.id] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: AgentSession["status"]) => {
      if (!session) throw new Error("No session");
      const updates: Record<string, unknown> = { status };
      if (status !== "active") updates.ended_at = new Date().toISOString();
      const { error } = await supabase
        .from("agent_sessions")
        .update(updates)
        .eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(sessionId ?? "") });
    },
  });

  const ensureSession = useCallback(
    (params: Parameters<typeof ensureSessionMutation.mutate>[0]) =>
      ensureSessionMutation.mutate(params),
    [ensureSessionMutation]
  );

  const addLog = useCallback(
    (content: string, logType?: AgentActivityLog["log_type"]) =>
      addLogMutation.mutate({ content, logType }),
    [addLogMutation]
  );

  const updateStatus = useCallback(
    (status: AgentSession["status"]) => updateStatusMutation.mutate(status),
    [updateStatusMutation]
  );

  return { session, logs, ensureSession, addLog, updateStatus };
}

/** Fetch all sessions for history view */
export function useAgentSessionHistory() {
  return useQuery({
    queryKey: ["agent-sessions", "history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_sessions")
        .select("*")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentSession[];
    },
  });
}
