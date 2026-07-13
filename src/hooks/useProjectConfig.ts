import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
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
	connected: boolean | null;
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
		connected: row.connected ?? false,
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
		connected: config.connected,
	};
}

export function useProjectConfig() {
	const queryClient = useQueryClient();

	const { data: configs = [], isLoading: configsLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const res = await apiFetch('/api/project-configs');
			if (!res.ok) throw new Error('Failed to fetch project configs');
			const rows = (await res.json()) as ProjectConfigRow[];
			return rows.map(rowToConfig);
		},
	});

	// Backward compat: expose first config as `config` for consumers that need a single one
	const config = configs.length > 0 ? configs[0] : null;

	const saveMutation = useMutation({
		mutationFn: async (newConfig: ProjectV2Config) => {
			const row = configToRow(newConfig);
			const res = await apiFetch('/api/project-configs', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(row),
			});
			if (!res.ok) throw new Error('Failed to save project config');
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
			await apiFetch(
				`/api/project-configs?org=${encodeURIComponent(org)}&project_number=${projectNumber}`,
				{ method: 'DELETE' },
			);
			const previous = queryClient.getQueryData<ProjectV2Config[]>(QUERY_KEY) ?? [];
			queryClient.setQueryData(
				QUERY_KEY,
				previous.filter((c) => !(c.org === org && c.projectNumber === projectNumber)),
			);
		},
		[queryClient],
	);

	const clearConfig = useCallback(() => {
		apiFetch('/api/project-configs?all=true', { method: 'DELETE' }).then(() =>
			queryClient.setQueryData(QUERY_KEY, []),
		);
	}, [queryClient]);

	return {
		config,
		configs,
		configsLoading,
		saveConfig,
		removeConfig,
		clearConfig,
	};
}
