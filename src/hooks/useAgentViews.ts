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
	const { repoPaths } = useRepoPaths();
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
		reorderViews,
	};
}
