import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitHubPullRequest } from '@/types';
import { apiFetch } from '@/lib/api-fetch';

async function fetchPRs(repos: string[]): Promise<GitHubPullRequest[]> {
	const res = await apiFetch(`/api/github/prs?repos=${encodeURIComponent(repos.join(','))}`);
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	if (data.error) throw new Error(data.error);
	return data.prs;
}

export function usePullRequests(repos: string[]) {
	const key = [...repos].sort().join(',');

	return useQuery({
		queryKey: ['github', 'prs', key],
		queryFn: () => fetchPRs(repos),
		enabled: repos.length > 0,
	});
}

async function mergePR(repo: string, pullNumber: number): Promise<{ sha: string; message: string }> {
	const res = await apiFetch('/api/github/prs/merge', {
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
			// La sidebar barre les worktrees dont la branche est mergée en lisant
			// `['merged-branches', repo]` : sans cette invalidation, la query reste en
			// cache (staleTime 5 min, pas de polling, refetchOnWindowFocus off) et seul
			// un rechargement complet la rafraîchit.
			// Préfixe volontairement non scopé au repo : la casse de `repo_full_name`
			// (API GitHub) peut diverger de celle des vues configurées — cf. la
			// comparaison en toLowerCase() dans PullRequestsList — et une clé exacte
			// raterait alors sa cible. Un merge est rare, refetch tous les repos est
			// sans conséquence.
			queryClient.invalidateQueries({ queryKey: ['merged-branches'] });
		},
	});
}
