import { useState, useCallback } from "react";
import { useRepoPaths } from "@/hooks/useRepoPaths";

export interface AgentView {
  label: string;
  path: string;
  repoFullName: string;
}

export function useAgentViews() {
  const { repoPaths, savePath } = useRepoPaths();
  const [activeIndex, setActiveIndex] = useState(0);

  const views: AgentView[] = repoPaths
    .filter((rp) => rp.local_path)
    .map((rp) => ({
      label: rp.repo_full_name.includes("/")
        ? rp.repo_full_name.split("/").pop()!
        : rp.repo_full_name,
      path: rp.local_path,
      repoFullName: rp.repo_full_name,
    }));

  const addView = useCallback(async (): Promise<AgentView | null> => {
    try {
      const res = await fetch("/api/filesystem/pick-directory");
      const { path } = await res.json();
      if (!path) return null;

      const label = path.split("/").filter(Boolean).pop() || path;

      // Check if this path is already registered
      const existing = views.find((v) => v.path === path);
      if (existing) {
        setActiveIndex(views.indexOf(existing));
        return existing;
      }

      // Use folder name as repo_full_name for manually added paths
      savePath(label, path);
      setActiveIndex(views.length);
      return { label, path, repoFullName: label };
    } catch {
      return null;
    }
  }, [views, savePath]);

  const activeView = views[activeIndex] ?? null;

  return {
    views,
    activeIndex,
    activeView,
    setActiveIndex,
    addView,
  };
}
