'use client';

import { useQuery } from '@tanstack/react-query';

export interface Me {
	login: string;
	name: string | null;
	avatarUrl: string | null;
}

/**
 * Current GitHub user, resolved server-side from the local `gh` CLI session.
 * `isAuthenticated` is false when `gh` isn't logged in (the UI can prompt for it).
 */
export function useMe() {
	const query = useQuery<Me | null>({
		queryKey: ['me'],
		queryFn: async () => {
			const res = await fetch('/api/me');
			if (res.status === 401) return null;
			if (!res.ok) throw new Error('Failed to load user');
			return res.json();
		},
		staleTime: 5 * 60_000,
		retry: false,
	});

	return {
		me: query.data ?? null,
		isLoading: query.isLoading,
		isAuthenticated: !!query.data,
	};
}
