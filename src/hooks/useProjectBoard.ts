import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { BoardIssue } from '@/lib/boardMerge';
import type { GitHubIssue } from '@/types';

export interface ProjectBoardRef {
	org: string;
	projectNumber: number;
	ownerType?: 'organization' | 'user';
}

interface ProjectBoardResponse {
	boardIssues?: GitHubIssue[];
	statusColumns?: string[];
	fetchedAt: string | null;
	error?: string;
}

interface ProjectBoardData {
	issues: BoardIssue[];
	statusColumns: string[];
	fetchedAt: string | null;
}

function boardQueryKey(board: ProjectBoardRef | null) {
	return ['project-board', board?.org ?? null, board?.projectNumber ?? null] as const;
}

async function fetchBoard(board: ProjectBoardRef, refresh: boolean): Promise<ProjectBoardData> {
	const params = new URLSearchParams({
		org: board.org,
		projectNumber: String(board.projectNumber),
		ownerType: board.ownerType ?? 'organization',
	});
	if (refresh) params.set('refresh', '1');

	const res = await apiFetch(`/api/github/projects?${params.toString()}`);
	if (!res.ok) throw new Error(`Project board fetch failed: ${res.status}`);
	const data: ProjectBoardResponse = await res.json();
	if (data.error) throw new Error(data.error);

	// La route ne tague pas les items : on rattache la config ici pour que le drag
	// (useUpdateIssueStatus) sache sur quel Project écrire.
	const issues: BoardIssue[] = (data.boardIssues ?? []).map((issue) => ({
		...issue,
		__config: {
			org: board.org,
			projectNumber: board.projectNumber,
			ownerType: board.ownerType,
		},
	}));

	return {
		issues,
		statusColumns: data.statusColumns ?? [],
		fetchedAt: data.fetchedAt ?? null,
	};
}

/**
 * Board d'un Project V2 connecté (items assignés au viewer), servi par le snapshot
 * SQLite côté serveur. Même contrat que `useRepoIssues` pour que le Kanban puisse
 * consommer indifféremment l'une ou l'autre source.
 */
export function useProjectBoard(board: ProjectBoardRef | null) {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: boardQueryKey(board),
		enabled: !!board,
		queryFn: () => fetchBoard(board!, false),
	});

	const refresh = useCallback(async () => {
		if (!board) return;
		// `refresh=1` contourne le snapshot : invalider seul rejouerait la lecture du cache.
		const data = await fetchBoard(board, true);
		queryClient.setQueryData(boardQueryKey(board), data);
	}, [board, queryClient]);

	return {
		issues: query.data?.issues ?? [],
		statusColumns: query.data?.statusColumns ?? [],
		fetchedAt: query.data?.fetchedAt ?? null,
		isLoading: !!board && query.isLoading,
		error: query.error as Error | undefined,
		refresh,
	};
}
