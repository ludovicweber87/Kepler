import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitHubPullRequest } from '@/types';

async function fetchPRs(repos: string[]): Promise<GitHubPullRequest[]> {
	const res = await fetch(`/api/github/prs?repos=${encodeURIComponent(repos.join(','))}`);
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	if (data.error) throw new Error(data.error);
	return data.prs;
}

export function usePullRequests(repos: string[]) {
	const key = repos.sort().join(',');

	return useQuery({
		queryKey: ['github', 'prs', key],
		queryFn: () => fetchPRs(repos),
		enabled: repos.length > 0,
	});
}

async function mergePR(repo: string, pullNumber: number): Promise<{ sha: string; message: string }> {
	const res = await fetch('/api/github/prs/merge', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ repo, pull_number: pullNumber }),
	});
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		throw new Error(data.error || `Merge failed: ${res.status}`);
	}
	return res.json();
}

export function useMergePR() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ repo, pullNumber }: { repo: string; pullNumber: number }) =>
			mergePR(repo, pullNumber),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['github', 'prs'] });
		},
	});
}
