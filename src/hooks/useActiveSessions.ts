import { useQuery } from "@tanstack/react-query";
import type { ActiveSession } from "@/app/api/sessions/route";

async function fetchSessions(): Promise<ActiveSession[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.sessions;
}

export type { ActiveSession };

export function useActiveSessions() {
  return useQuery({
    queryKey: ["sessions", "active"],
    queryFn: fetchSessions,
    refetchInterval: 5_000,
  });
}
