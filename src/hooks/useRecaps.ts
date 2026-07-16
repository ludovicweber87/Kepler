import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { localFetch } from '@/lib/local-fetch';
import type { DailyRecap, RecapSchedule } from '@/types';

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

// ─── Schedules (créneaux horaires par repo) ─────────────────

export function useRecapSchedules(repo: string | undefined) {
	const qc = useQueryClient();
	const queryKey = ['recap-schedules', repo];

	const { data: schedules = [], isLoading } = useQuery({
		queryKey,
		enabled: !!repo,
		queryFn: async () => {
			const res = await apiFetch(`/api/recap-schedules?repo=${encodeURIComponent(repo!)}`);
			if (!res.ok) throw new Error('Failed to fetch schedules');
			return (await res.json()) as RecapSchedule[];
		},
	});

	const addMutation = useMutation({
		mutationFn: async (time: string) => {
			const res = await apiFetch('/api/recap-schedules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ repo_full_name: repo, time }),
			});
			if (!res.ok) throw new Error('Failed to add schedule');
		},
		onSettled: () => qc.invalidateQueries({ queryKey }),
	});

	const removeMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/recap-schedules?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to remove schedule');
		},
		onSettled: () => qc.invalidateQueries({ queryKey }),
	});

	const addSchedule = useCallback((time: string) => addMutation.mutate(time), [addMutation]);
	const removeSchedule = useCallback((id: string) => removeMutation.mutate(id), [removeMutation]);

	return { schedules, isLoading, addSchedule, removeSchedule };
}
