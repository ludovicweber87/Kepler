import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { supabase } from '@/lib/supabase';
import type { ProjectV2Config, ProjectV2View, ViewRepoMapping } from '@/types';

const QUERY_KEY = ['project-config'];

interface ProjectConfigRow {
	id: string;
	org: string;
	project_number: number;
	project_title: string;
	selected_views: string[];
	active_view: string | null;
	view_order: string[];
	view_repo_mappings: ViewRepoMapping[];
	status_columns: string[];
	views: ProjectV2View[];
}

function rowToConfig(row: ProjectConfigRow): ProjectV2Config {
	return {
		org: row.org,
		projectNumber: row.project_number,
		projectTitle: row.project_title,
		selectedViews: row.selected_views ?? [],
		activeView: row.active_view,
		viewOrder: row.view_order ?? [],
		viewRepoMappings: row.view_repo_mappings ?? [],
		statusColumns: row.status_columns ?? [],
		views: row.views ?? [],
	};
}

function configToRow(config: ProjectV2Config) {
	return {
		org: config.org,
		project_number: config.projectNumber,
		project_title: config.projectTitle,
		selected_views: config.selectedViews,
		active_view: config.activeView,
		view_order: config.viewOrder,
		view_repo_mappings: config.viewRepoMappings as unknown as Record<string, unknown>[],
		status_columns: config.statusColumns,
		views: config.views as unknown as Record<string, unknown>[],
	};
}

async function fetchConfig(userId: string): Promise<ProjectV2Config | null> {
	const { data, error } = await supabase
		.from('project_configs')
		.select('*')
		.eq('user_id', userId)
		.limit(1)
		.single();

	if (error) {
		if (error.code === 'PGRST116') return null; // no rows
		throw error;
	}

	return rowToConfig(data as ProjectConfigRow);
}

export function useProjectConfig() {
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const userId = session?.user?.id ?? null;

	const { data: config = null } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: () => fetchConfig(userId!),
		enabled: !!userId,
	});

	const saveMutation = useMutation({
		mutationFn: async (newConfig: ProjectV2Config) => {
			const row = configToRow(newConfig);
			const { error } = await supabase
				.from('project_configs')
				.upsert({ ...row, user_id: userId }, { onConflict: 'user_id,org,project_number' });
			if (error) throw error;
		},
		onMutate: async (newConfig) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			queryClient.setQueryData(QUERY_KEY, newConfig);
		},
		onError: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEY });
		},
	});

	const saveConfig = useCallback(
		(newConfig: ProjectV2Config) => saveMutation.mutate(newConfig),
		[saveMutation],
	);

	const clearConfig = useCallback(() => {
		supabase
			.from('project_configs')
			.delete()
			.not('id', 'is', null)
			.then(() => queryClient.setQueryData(QUERY_KEY, null));
	}, [queryClient]);

	const setActiveView = useCallback(
		(viewName: string | null) => {
			if (!config) return;
			saveMutation.mutate({ ...config, activeView: viewName });
		},
		[config, saveMutation],
	);

	const reorderViews = useCallback(
		(orderedNames: string[]) => {
			if (!config) return;
			saveMutation.mutate({ ...config, viewOrder: orderedNames });
		},
		[config, saveMutation],
	);

	const getViewRepos = useCallback(
		(viewName: string): string[] | undefined => {
			if (!config) return undefined;
			const mapping = config.viewRepoMappings.find(
				(m: ViewRepoMapping) => m.viewName === viewName,
			);
			return mapping?.repos;
		},
		[config],
	);

	const selectedViewMappings = (() => {
		if (!config) return [];
		const all = config.viewRepoMappings.filter((m: ViewRepoMapping) =>
			config.selectedViews.includes(m.viewName),
		);
		const order = config.viewOrder;
		if (!order?.length) return all;
		const byName = new Map(all.map((m) => [m.viewName, m]));
		const ordered = order.filter((n) => byName.has(n)).map((n) => byName.get(n)!);
		for (const m of all) {
			if (!order.includes(m.viewName)) ordered.push(m);
		}
		return ordered;
	})();

	// Background sync: re-fetch Project V2 data from GitHub and update mappings
	const syncingRef = useRef(false);
	const syncViews = useCallback(async () => {
		if (!config || syncingRef.current) return;
		syncingRef.current = true;
		try {
			const { apiFetch } = await import('@/lib/api-fetch');
			const res = await apiFetch(
				`/api/github/projects?org=${config.org}&projectNumber=${config.projectNumber}`,
			);
			if (!res.ok) return;
			const data = await res.json();
			const newMappings: ViewRepoMapping[] = data.viewRepoMappings ?? [];
			const newViews: ProjectV2View[] = data.views ?? [];
			const newStatusColumns: string[] = data.statusColumns ?? config.statusColumns;

			// Merge: keep user settings, update GitHub data
			saveMutation.mutate({
				...config,
				viewRepoMappings: newMappings,
				views: newViews,
				statusColumns: newStatusColumns,
			});
		} catch {
			// Sync failed silently — stale data is still usable
		} finally {
			syncingRef.current = false;
		}
	}, [config, saveMutation]);

	return {
		config,
		saveConfig,
		clearConfig,
		setActiveView,
		reorderViews,
		getViewRepos,
		selectedViewMappings,
		syncViews,
	};
}
