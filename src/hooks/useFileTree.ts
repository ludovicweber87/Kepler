'use client';

import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';

export interface FileTreeResponse {
	files: string[];
	truncated: boolean;
	root: string;
}

/** Nom d'erreur porté quand le dossier n'est pas un dépôt git, pour un message dédié. */
const NOT_A_REPO = 'NotARepoError';

/**
 * Liste des fichiers non ignorés par git à la racine `cwd`.
 * Pas de polling : l'invalidation est explicite depuis le Workbench, à la fin
 * d'un tour d'agent — c'est le seul moment où l'arborescence peut avoir bougé.
 */
export function useFileTree(cwd: string | null) {
	const query = useQuery({
		queryKey: ['file-tree', cwd],
		queryFn: async (): Promise<FileTreeResponse> => {
			const params = new URLSearchParams({ cwd: cwd! });
			const res = await localFetch(`/filesystem/tree?${params}`);
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as {
					error?: string;
					code?: string;
				};
				const err = new Error(body.error ?? 'Failed to list files');
				if (body.code === 'not_a_repo') err.name = NOT_A_REPO;
				throw err;
			}
			return res.json();
		},
		enabled: !!cwd,
		staleTime: 30_000,
	});

	return {
		files: query.data?.files ?? [],
		truncated: query.data?.truncated ?? false,
		isLoading: query.isLoading,
		error: query.error,
		notARepo: query.error?.name === NOT_A_REPO,
	};
}
