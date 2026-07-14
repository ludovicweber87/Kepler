import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Récupère, pour une liste de repos, l'ensemble des branches mergées (état PR GitHub).
 * Appelé UNE seule fois au niveau composant (Rules of Hooks) : la liste des repos
 * est passée en entrée, et `mergedForRepo(repo)` lit le résultat correspondant.
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
				const data = (await res.json()) as { branches: string[] };
				return new Set(data.branches);
			},
			staleTime: 5 * 60_000,
		})),
	});

	const byRepo = useMemo(() => {
		const map = new Map<string, Set<string>>();
		repos.forEach((repo, i) => {
			map.set(repo, results[i]?.data ?? new Set<string>());
		});
		return map;
	}, [repos, results]);

	const mergedForRepo = useMemo(
		() => (repoFullName: string) => byRepo.get(repoFullName) ?? new Set<string>(),
		[byRepo],
	);

	return { mergedForRepo };
}
