import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';

export interface Branch {
	name: string;
	lastCommitDate: string;
	lastCommitMessage: string;
	lastCommitAuthor: string;
	isCurrent: boolean;
	isRemote?: boolean;
	isCheckedOut?: boolean;
}

export interface BranchCommit {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	date: string;
}

export function useBranches(
	localPath: string | undefined,
	opts?: { includeRemote?: boolean; enabled?: boolean },
) {
	const includeRemote = opts?.includeRemote ?? false;
	return useQuery({
		queryKey: ['git-branches', localPath, includeRemote],
		queryFn: async () => {
			const params = new URLSearchParams({ path: localPath! });
			if (includeRemote) params.set('includeRemote', 'true');
			const res = await localFetch(`/git/branches?${params.toString()}`);
			if (!res.ok) throw new Error('Failed to fetch branches');
			const { branches } = await res.json();
			return branches as Branch[];
		},
		enabled: !!localPath && (opts?.enabled ?? true),
		staleTime: 30_000,
	});
}

export function useBranchLog(localPath: string | undefined, branch: string | undefined) {
	return useQuery({
		queryKey: ['git-branch-log', localPath, branch],
		queryFn: async () => {
			const res = await localFetch(
				`/git/branches/log?path=${encodeURIComponent(localPath!)}&branch=${encodeURIComponent(branch!)}`,
			);
			if (!res.ok) throw new Error('Failed to fetch branch log');
			const { commits } = await res.json();
			return commits as BranchCommit[];
		},
		enabled: !!localPath && !!branch,
		staleTime: 30_000,
	});
}
