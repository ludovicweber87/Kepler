import { useQuery } from '@tanstack/react-query';
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
