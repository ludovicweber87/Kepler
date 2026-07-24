import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { localFetch } from '@/lib/local-fetch';
import type { DocWithCategories } from '@/types';

export interface DocChatMessage {
	role: 'user' | 'assistant';
	kind: string; // 'instruction' | 'ack' | 'error' | 'text'
	text: string;
	created_at: string;
}

export function useDoc(id: string) {
	const queryClient = useQueryClient();

	const { data: doc, isLoading } = useQuery({
		queryKey: ['doc', id],
		queryFn: async () => {
			const res = await apiFetch(`/api/docs?id=${encodeURIComponent(id)}`);
			if (!res.ok) throw new Error('Failed to fetch doc');
			return (await res.json()) as DocWithCategories | null;
		},
		refetchInterval: (query) => {
			const d = query.state.data as DocWithCategories | null | undefined;
			return d && (d.status === 'queued' || d.status === 'generating') ? 3000 : false;
		},
	});

	const { data: chat = [] } = useQuery({
		queryKey: ['doc-chat', id],
		queryFn: async () => {
			try {
				const res = await localFetch(`/docs/chat?docId=${encodeURIComponent(id)}`);
				if (!res.ok) return [] as DocChatMessage[];
				const json = (await res.json()) as { messages?: DocChatMessage[] };
				return json.messages ?? [];
			} catch {
				return [] as DocChatMessage[];
			}
		},
		refetchInterval: () => {
			const d = queryClient.getQueryData<DocWithCategories | null>(['doc', id]);
			return d && (d.status === 'queued' || d.status === 'generating') ? 3000 : false;
		},
	});

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ['doc', id] });
		queryClient.invalidateQueries({ queryKey: ['doc-chat', id] });
		queryClient.invalidateQueries({ queryKey: ['docs'] });
	};

	const saveMutation = useMutation({
		mutationFn: async (content: string) => {
			const res = await apiFetch('/api/docs', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, content }),
			});
			if (!res.ok) throw new Error('Failed to save doc');
			return (await res.json()) as DocWithCategories;
		},
		onSettled: invalidate,
	});

	const refineMutation = useMutation({
		mutationFn: async (instruction: string) => {
			await localFetch('/docs/refine', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ docId: id, instruction }),
			});
		},
		onSettled: invalidate,
	});

	const retryMutation = useMutation({
		mutationFn: async () => {
			await localFetch('/docs/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ docId: id }),
			});
		},
		onSettled: invalidate,
	});

	const saveContent = useCallback(
		(content: string) => saveMutation.mutateAsync(content),
		[saveMutation],
	);
	const refine = useCallback(
		(instruction: string) => refineMutation.mutate(instruction),
		[refineMutation],
	);
	const retry = useCallback(() => retryMutation.mutate(), [retryMutation]);

	return {
		doc: doc ?? null,
		chat,
		isLoading,
		saveContent,
		saving: saveMutation.isPending,
		refine,
		refining: refineMutation.isPending,
		retry,
	};
}
