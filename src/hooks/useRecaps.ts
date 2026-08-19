import { useMemo } from 'react';
import { useQuery, useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { localFetch } from '@/lib/local-fetch';
import type { DailyRecap } from '@/types';

const GENERATE_RECAP_KEY = ['generate-recap'] as const;

// ─── Recaps (read + generate + delete) ──────────────────────

export function useRecaps(repo: string | undefined, month: string) {
	return useQuery({
		queryKey: ['recaps', repo, month],
		enabled: !!repo,
		queryFn: async () => {
			const res = await apiFetch(
				`/api/recaps?repo=${encodeURIComponent(repo!)}&month=${encodeURIComponent(month)}`,
			);
			if (!res.ok) throw new Error('Failed to fetch recaps');
			return (await res.json()) as DailyRecap[];
		},
	});
}

export function useGenerateRecap() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: GENERATE_RECAP_KEY,
		mutationFn: async ({ repoFullName, date }: { repoFullName: string; date: string }) => {
			const res = await localFetch('/recap/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ repoFullName, date }),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.error ?? 'Failed to generate recap');
			}
			return ((await res.json()) as { recap: DailyRecap }).recap;
		},
		onSuccess: (_recap, { repoFullName }) => {
			qc.invalidateQueries({ queryKey: ['recaps', repoFullName] });
		},
	});
}

export function useDeleteRecap() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ id }: { id: string; repoFullName: string }) => {
			const res = await apiFetch(`/api/recaps?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete recap');
		},
		onSuccess: (_data, { repoFullName }) => {
			qc.invalidateQueries({ queryKey: ['recaps', repoFullName] });
		},
	});
}

// ─── In-flight generations (garde un loader par rapport) ─────

// Suit TOUTES les générations en cours simultanément (une entrée par date),
// pas seulement la dernière — contrairement à `mutation.isPending`/`variables`.
export function useGeneratingDates(): Set<string> {
	const dates = useMutationState({
		filters: { mutationKey: GENERATE_RECAP_KEY, status: 'pending' },
		select: (m) => (m.state.variables as { date?: string } | undefined)?.date,
	});
	return useMemo(() => new Set(dates.filter((d): d is string => !!d)), [dates]);
}
