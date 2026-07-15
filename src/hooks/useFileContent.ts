'use client';

import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';

export interface FileContent {
	content: string;
	truncated: boolean;
	path: string;
}

export function useFileContent(cwd: string | null, path: string | null) {
	const query = useQuery({
		queryKey: ['file-content', cwd, path],
		queryFn: async (): Promise<FileContent> => {
			const params = new URLSearchParams();
			if (cwd) params.set('cwd', cwd);
			params.set('path', path!);
			const res = await localFetch(`/filesystem/read-file?${params}`);
			if (!res.ok) throw new Error('Failed to read file');
			return res.json();
		},
		enabled: !!path,
		staleTime: 30_000,
	});

	return { data: query.data, isLoading: query.isLoading, error: query.error };
}
