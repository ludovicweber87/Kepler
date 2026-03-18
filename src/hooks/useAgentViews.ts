import { useState, useCallback } from 'react';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useTabOrder } from '@/hooks/useTabOrder';

export interface AgentView {
	label: string;
	path: string;
	repoFullName: string;
}

const TAB_GROUP = 'views';

export function useAgentViews() {
	const { repoPaths, savePath } = useRepoPaths();
	const { applyOrder, reorder } = useTabOrder(TAB_GROUP);
	const [activeIndex, setActiveIndex] = useState(0);

	const rawViews: AgentView[] = repoPaths
		.filter((rp) => rp.local_path)
		.map((rp) => ({
			label: rp.repo_full_name.includes('/')
				? rp.repo_full_name.split('/').pop()!
				: rp.repo_full_name,
			path: rp.local_path,
			repoFullName: rp.repo_full_name,
		}));

	// Apply saved tab order
	const views = applyOrder(rawViews, (v) => v.label);

	const addView = useCallback(async (): Promise<AgentView | null> => {
		try {
			const { localFetch } = await import('@/lib/local-fetch');
			const res = await localFetch('/filesystem/pick-directory');
			const { path } = await res.json();
			if (!path) return null;

			const existing = views.find((v) => v.path === path);
			if (existing) {
				setActiveIndex(views.indexOf(existing));
				return existing;
			}

			// Resolve real owner/repo from git remote
			let repoFullName = '';
			try {
				const repoRes = await localFetch(`/git/repo-name?path=${encodeURIComponent(path)}`);
				if (repoRes.ok) {
					const { repoFullName: resolved } = await repoRes.json();
					if (resolved?.includes('/')) repoFullName = resolved;
				}
			} catch {
				// Will fallback below
			}

			// Fallback: use directory name, but this won't work for GitHub API calls
			if (!repoFullName) {
				console.warn('[useAgentViews] Could not resolve owner/repo for path:', path);
				repoFullName = path.split('/').filter(Boolean).pop() || path;
			}

			const label = repoFullName.includes('/')
				? repoFullName.split('/').pop()!
				: repoFullName;

			savePath(repoFullName, path);
			setActiveIndex(views.length);
			return { label, path, repoFullName };
		} catch {
			return null;
		}
	}, [views, savePath]);

	const reorderViews = useCallback(
		(newOrder: string[]) => {
			reorder(newOrder);
		},
		[reorder],
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
