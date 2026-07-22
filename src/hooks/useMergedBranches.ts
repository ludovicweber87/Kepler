import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { MergedPrRef } from '@/types';

/**
 * Récupère, pour une liste de repos, les branches mergées (état PR GitHub).
 * Appelé UNE seule fois au niveau composant (Rules of Hooks) : la liste des repos
 * est passée en entrée. `mergedForRepo(repo)` lit le Set de refs, `mergedPrsForRepo(repo)`
 * lit les PRs mergées enrichies ({ ref, number, html_url }) du repo.
 */
export function useMergedBranches(repoFullNames: string[]) {
	// Stabilise la liste pour éviter des requêtes redondantes.
	const repos = useMemo(
		() => [...new Set(repoFullNames.filter((r) => r && r.includes('/')))].sort(),
		[repoFullNames],
	);

	const results = useQueries({
		queries: repos.map((repo) => ({
			queryKey: ['merged-branches', repo],
			queryFn: async () => {
				const res = await apiFetch(
					`/api/github/merged-branches?repo=${encodeURIComponent(repo)}`,
				);
				if (!res.ok) throw new Error('Failed to fetch merged branches');
				const data = (await res.json()) as {
					branches: string[];
					mergedPrs?: MergedPrRef[];
				};
				return {
					branches: new Set(data.branches),
					mergedPrs: data.mergedPrs ?? [],
				};
			},
			staleTime: 5 * 60_000,
		})),
	});

	const byRepo = useMemo(() => {
		const map = new Map<string, { branches: Set<string>; mergedPrs: MergedPrRef[] }>();
		repos.forEach((repo, i) => {
			map.set(repo, results[i]?.data ?? { branches: new Set<string>(), mergedPrs: [] });
		});
		return map;
	}, [repos, results]);

	const mergedForRepo = useMemo(
		() => (repoFullName: string) => byRepo.get(repoFullName)?.branches ?? new Set<string>(),
		[byRepo],
	);

	const mergedPrsForRepo = useMemo(
		() => (repoFullName: string) => byRepo.get(repoFullName)?.mergedPrs ?? [],
		[byRepo],
	);

	return { mergedForRepo, mergedPrsForRepo };
}
