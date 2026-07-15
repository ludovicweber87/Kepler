'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';
import { parseDiff } from '@/lib/gitDiff';

export function useGitDiff(projectPath: string | null, branch: string | null) {
	const query = useQuery({
		queryKey: ['git-diff', projectPath, branch],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (projectPath) params.set('cwd', projectPath);
			if (branch) params.set('branch', branch);
			const res = await localFetch(`/git/diff?${params}`);
			if (!res.ok) throw new Error('Failed to fetch diff');
			return res.json() as Promise<{ diff: string; stats: string }>;
		},
		enabled: !!projectPath,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
	});

	const files = useMemo(() => parseDiff(query.data?.diff ?? ''), [query.data?.diff]);

	return { files, isLoading: query.isLoading, error: query.error };
}
