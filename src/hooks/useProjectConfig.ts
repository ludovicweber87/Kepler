import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useSupabase } from '@/hooks/useSupabase';
import type { SupabaseClient } from '@supabase/supabase-js';
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
	owner_type: 'organization' | 'user' | null;
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
		ownerType: row.owner_type ?? undefined,
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
		owner_type: config.ownerType ?? null,
	};
}

async function fetchConfigs(supabase: SupabaseClient, userId: string): Promise<ProjectV2Config[]> {
	const { data, error } = await supabase
		.from('project_configs')
		.select('*')
		.eq('user_id', userId);

	if (error) throw error;
	if (!data || data.length === 0) return [];

	return (data as ProjectConfigRow[]).map(rowToConfig);
}

/** Find the config that owns a given repo based on viewRepoMappings */
function findConfigForRepo(
	configs: ProjectV2Config[],
	repoFullName: string,
): ProjectV2Config | undefined {
	const lower = repoFullName.toLowerCase();
	return configs.find((c) =>
		c.viewRepoMappings.some((m) => m.repos.some((r) => r.toLowerCase() === lower)),
	);
}

export function useProjectConfig() {
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const userId = session?.user?.id ?? null;
	const { supabase, isReady } = useSupabase();

	const { data: configs = [], isLoading: configsLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: () => fetchConfigs(supabase, userId!),
		enabled: !!userId && isReady,
	});

	// Backward compat: expose first config as `config` for consumers that need a single one
	const config = configs.length > 0 ? configs[0] : null;

	const saveMutation = useMutation({
		mutationFn: async (newConfig: ProjectV2Config) => {
			const row = configToRow(newConfig);
			// Check if row exists for this user + project combo
			const { data: existing } = await supabase
				.from('project_configs')
				.select('id')
				.eq('user_id', userId)
				.eq('org', newConfig.org)
				.eq('project_number', newConfig.projectNumber)
				.maybeSingle();

			if (existing) {
				const { error } = await supabase
					.from('project_configs')
					.update(row)
					.eq('id', existing.id);
				if (error) throw error;
			} else {
				const { error } = await supabase
					.from('project_configs')
					.insert({ ...row, user_id: userId });
				if (error) throw error;
			}
		},
		onMutate: async (newConfig) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<ProjectV2Config[]>(QUERY_KEY) ?? [];
			const key = `${newConfig.org}/${newConfig.projectNumber}`;
			const exists = previous.some((c) => `${c.org}/${c.projectNumber}` === key);
			const updated = exists
				? previous.map((c) => (`${c.org}/${c.projectNumber}` === key ? newConfig : c))
				: [...previous, newConfig];
			queryClient.setQueryData(QUERY_KEY, updated);
			return { previous };
		},
		onError: (_err, _newConfig, context) => {
			if (context?.previous) {
				queryClient.setQueryData(QUERY_KEY, context.previous);
			}
		},
	});

	const saveConfig = useCallback(
		(newConfig: ProjectV2Config) => saveMutation.mutate(newConfig),
		[saveMutation],
	);

	const removeConfig = useCallback(
		async (org: string, projectNumber: number) => {
			await supabase
				.from('project_configs')
				.delete()
				.eq('user_id', userId)
				.eq('org', org)
				.eq('project_number', projectNumber);
			const previous = queryClient.getQueryData<ProjectV2Config[]>(QUERY_KEY) ?? [];
			queryClient.setQueryData(
				QUERY_KEY,
				previous.filter((c) => !(c.org === org && c.projectNumber === projectNumber)),
			);
		},
		[userId, queryClient],
	);

	const clearConfig = useCallback(() => {
		supabase
			.from('project_configs')
			.delete()
			.eq('user_id', userId)
			.then(() => queryClient.setQueryData(QUERY_KEY, []));
	}, [userId, queryClient]);

	const setActiveView = useCallback(
		(viewName: string | null) => {
			// Find which config contains this view
			const target =
				configs.find((c) => c.selectedViews.includes(viewName ?? '')) ?? configs[0];
			if (!target) return;
			saveMutation.mutate({ ...target, activeView: viewName });
		},
		[configs, saveMutation],
	);

	const reorderViews = useCallback(
		(orderedNames: string[]) => {
			// Reorder affects all configs — distribute view names back to their owning configs
			for (const c of configs) {
				const relevant = orderedNames.filter((n) => c.selectedViews.includes(n));
				if (relevant.length > 0) {
					saveMutation.mutate({ ...c, viewOrder: relevant });
				}
			}
		},
		[configs, saveMutation],
	);

	const getViewRepos = useCallback(
		(viewName: string): string[] | undefined => {
			for (const c of configs) {
				const mapping = c.viewRepoMappings.find(
					(m: ViewRepoMapping) => m.viewName === viewName,
				);
				if (mapping) return mapping.repos;
			}
			return undefined;
		},
		[configs],
	);

	// Aggregate selectedViewMappings from all configs
	const selectedViewMappings = (() => {
		const all: ViewRepoMapping[] = [];
		const allOrders: string[] = [];

		for (const c of configs) {
			const selected = c.viewRepoMappings.filter((m: ViewRepoMapping) =>
				c.selectedViews.includes(m.viewName),
			);
			all.push(...selected);
			if (c.viewOrder?.length) {
				allOrders.push(...c.viewOrder);
			}
		}

		if (allOrders.length === 0) return all;

		const byName = new Map(all.map((m) => [m.viewName, m]));
		const ordered = allOrders.filter((n) => byName.has(n)).map((n) => byName.get(n)!);
		for (const m of all) {
			if (!allOrders.includes(m.viewName)) ordered.push(m);
		}
		return ordered;
	})();

	// Background sync: re-fetch Project V2 data from GitHub for all configs
	const syncingRef = useRef(false);
	const syncViews = useCallback(async () => {
		if (configs.length === 0 || syncingRef.current) return;
		syncingRef.current = true;
		try {
			const { apiFetch } = await import('@/lib/api-fetch');
			for (const c of configs) {
				const res = await apiFetch(
					`/api/github/projects?org=${c.org}&projectNumber=${c.projectNumber}&ownerType=${c.ownerType ?? 'organization'}`,
				);
				if (!res.ok) continue;
				const data = await res.json();
				const newMappings: ViewRepoMapping[] = data.viewRepoMappings ?? [];
				const newViews: ProjectV2View[] = data.views ?? [];
				const newStatusColumns: string[] = data.statusColumns ?? c.statusColumns;

				saveMutation.mutate({
					...c,
					viewRepoMappings: newMappings,
					views: newViews,
					statusColumns: newStatusColumns,
				});
			}
		} catch {
			// Sync failed silently — stale data is still usable
		} finally {
			syncingRef.current = false;
		}
	}, [configs, saveMutation]);

	/** Find the config that owns a repo (for status mutations) */
	const getConfigForRepo = useCallback(
		(repoFullName: string): ProjectV2Config | undefined => {
			return findConfigForRepo(configs, repoFullName);
		},
		[configs],
	);

	return {
		config,
		configs,
		configsLoading,
		saveConfig,
		removeConfig,
		clearConfig,
		setActiveView,
		reorderViews,
		getViewRepos,
		selectedViewMappings,
		syncViews,
		getConfigForRepo,
	};
}
