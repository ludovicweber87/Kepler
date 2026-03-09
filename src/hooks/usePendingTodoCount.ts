import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

async function fetchPendingCount(): Promise<number> {
  const { count, error } = await supabase
    .from("todos")
    .select("*", { count: "exact", head: true })
    .eq("done", false);

  if (error) throw error;
  return count ?? 0;
}

export function usePendingTodoCount() {
  const { data: count = 0 } = useQuery({
    queryKey: ["todos", "pending-count"],
    queryFn: fetchPendingCount,
    refetchInterval: 30_000,
  });

  return count;
}
