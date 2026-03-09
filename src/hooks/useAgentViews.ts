import { useState, useCallback } from "react";
import { useRepoPaths } from "@/hooks/useRepoPaths";
import { useTabOrder } from "@/hooks/useTabOrder";

export interface AgentView {
  label: string;
  path: string;
  repoFullName: string;
}

const TAB_GROUP = "views";

export function useAgentViews() {
  const { repoPaths, savePath } = useRepoPaths();
  const { applyOrder, reorder } = useTabOrder(TAB_GROUP);
  const [activeIndex, setActiveIndex] = useState(0);

  const rawViews: AgentView[] = repoPaths
    .filter((rp) => rp.local_path)
    .map((rp) => ({
      label: rp.repo_full_name.includes("/")
        ? rp.repo_full_name.split("/").pop()!
        : rp.repo_full_name,
      path: rp.local_path,
      repoFullName: rp.repo_full_name,
    }));

  // Apply saved tab order
  const views = applyOrder(rawViews, (v) => v.label);

  const addView = useCallback(async (): Promise<AgentView | null> => {
    try {
      const res = await fetch("/api/filesystem/pick-directory");
      const { path } = await res.json();
      if (!path) return null;

      const label = path.split("/").filter(Boolean).pop() || path;

      const existing = views.find((v) => v.path === path);
      if (existing) {
        setActiveIndex(views.indexOf(existing));
        return existing;
      }

      savePath(label, path);
      setActiveIndex(views.length);
      return { label, path, repoFullName: label };
    } catch {
      return null;
    }
  }, [views, savePath]);

  const reorderViews = useCallback(
    (newOrder: string[]) => {
      reorder(newOrder);
    },
    [reorder]
  );

  const activeView = views[activeIndex] ?? null;

  return {
    views,
    activeIndex,
    activeView,
    setActiveIndex,
    addView,
    reorderViews,
  };
}
