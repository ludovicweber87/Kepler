import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface DayActivity {
  day: string; // "Lun", "Mar", ...
  date: string; // ISO date
  completed: number;
  added: number;
}

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

async function fetchWeeklyActivity(): Promise<DayActivity[]> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);

  const [{ data: allTodos, error: e1 }, { data: doneTodos, error: e2 }] = await Promise.all([
    supabase
      .from("todos")
      .select("created_at")
      .gte("created_at", weekAgo.toISOString()),
    supabase
      .from("todos")
      .select("created_at, done")
      .eq("done", true)
      .gte("created_at", weekAgo.toISOString()),
  ]);

  if (e1) throw e1;
  if (e2) throw e2;

  const days: DayActivity[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAgo);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({
      day: DAY_LABELS[d.getDay()],
      date: dateStr,
      completed: 0,
      added: 0,
    });
  }

  for (const t of allTodos ?? []) {
    const dateStr = t.created_at.slice(0, 10);
    const entry = days.find((d) => d.date === dateStr);
    if (entry) entry.added++;
  }

  for (const t of doneTodos ?? []) {
    const dateStr = t.created_at.slice(0, 10);
    const entry = days.find((d) => d.date === dateStr);
    if (entry) entry.completed++;
  }

  return days;
}

export function useWeeklyActivity() {
  return useQuery({
    queryKey: ["todos", "weekly-activity"],
    queryFn: fetchWeeklyActivity,
    refetchInterval: 60_000,
  });
}
