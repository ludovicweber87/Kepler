'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Notification } from '@/types';

const QUERY_KEY = ['notifications'];

async function fetchNotifications(): Promise<Notification[]> {
	const { data, error } = await supabase
		.from('notifications')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(100);
	if (error) throw error;
	return data ?? [];
}

export function useNotifications() {
	const qc = useQueryClient();

	const { data: notifications = [], isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: fetchNotifications,
		refetchInterval: 30_000,
	});

	const unreadCount = notifications.filter((n) => !n.read).length;

	const markAsReadMutation = useMutation({
		mutationFn: async (id: string) => {
			await supabase.from('notifications').update({ read: true }).eq('id', id);
		},
		onMutate: async (id) => {
			await qc.cancelQueries({ queryKey: QUERY_KEY });
			const prev = qc.getQueryData<Notification[]>(QUERY_KEY);
			qc.setQueryData<Notification[]>(QUERY_KEY, (old) =>
				old?.map((n) => (n.id === id ? { ...n, read: true } : n)),
			);
			return { prev };
		},
		onError: (_err, _id, ctx) => {
			if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
		},
	});

	const markAllAsReadMutation = useMutation({
		mutationFn: async () => {
			await supabase.from('notifications').update({ read: true }).eq('read', false);
		},
		onMutate: async () => {
			await qc.cancelQueries({ queryKey: QUERY_KEY });
			const prev = qc.getQueryData<Notification[]>(QUERY_KEY);
			qc.setQueryData<Notification[]>(QUERY_KEY, (old) =>
				old?.map((n) => ({ ...n, read: true })),
			);
			return { prev };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
		},
	});

	const markAsRead = useCallback((id: string) => markAsReadMutation.mutate(id), [markAsReadMutation]);
	const markAllAsRead = useCallback(() => markAllAsReadMutation.mutate(), [markAllAsReadMutation]);

	return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead };
}

/** Insert a notification from anywhere (client-side) */
export async function createNotification(params: {
	type?: string;
	title: string;
	message?: string;
	issue_owner?: string;
	issue_repo?: string;
	issue_number?: number;
	issue_title?: string;
	session_id?: string;
	view_name?: string;
}): Promise<void> {
	await supabase.from('notifications').insert({
		type: params.type ?? 'report_published',
		title: params.title,
		message: params.message ?? null,
		issue_owner: params.issue_owner ?? null,
		issue_repo: params.issue_repo ?? null,
		issue_number: params.issue_number ?? null,
		issue_title: params.issue_title ?? null,
		session_id: params.session_id ?? null,
		view_name: params.view_name ?? null,
	});
}
