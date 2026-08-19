'use client';

import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';

/** Interroge `git status --porcelain` d'un worktree → présence de changements non commités. */
export function useGitStatus(projectPath: string | null) {
	const query = useQuery({
		queryKey: ['git-status', projectPath],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (projectPath) params.set('cwd', projectPath);
			const res = await localFetch(`/git/status?${params}`);
			if (!res.ok) throw new Error('Failed to fetch git status');
			return res.json() as Promise<{ dirty: boolean; count: number }>;
		},
		enabled: !!projectPath,
		staleTime: 10_000,
		refetchInterval: 10_000,
		refetchOnWindowFocus: true,
	});

	return { dirty: query.data?.dirty ?? false, count: query.data?.count ?? 0, isLoading: query.isLoading };
}
