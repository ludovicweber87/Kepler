'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { createSupabaseClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

interface SupabaseContextValue {
	supabase: SupabaseClient;
	isReady: boolean;
}

// Lazy default — replaced once token is fetched
const SupabaseContext = createContext<SupabaseContextValue | null>(null);

const REFRESH_MARGIN_MS = 10 * 60 * 1000; // refresh 10min before expiry

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
	const { data: session, status } = useSession();
	const [client, setClient] = useState<SupabaseClient | null>(null);
	const expiresAtRef = useRef<number>(0);
	const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fetchingRef = useRef(false);

	const fetchToken = useCallback(async () => {
		if (fetchingRef.current) return;
		fetchingRef.current = true;
		try {
			const res = await fetch('/api/supabase-token', { method: 'POST' });
			if (!res.ok) return;
			const { token, expiresAt } = await res.json();
			expiresAtRef.current = expiresAt;
			setClient(createSupabaseClient(token));

			// Schedule refresh
			if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
			const msUntilRefresh = (expiresAt * 1000 - Date.now()) - REFRESH_MARGIN_MS;
			if (msUntilRefresh > 0) {
				refreshTimerRef.current = setTimeout(() => {
					fetchingRef.current = false;
					fetchToken();
				}, msUntilRefresh);
			}
		} finally {
			fetchingRef.current = false;
		}
	}, []);

	useEffect(() => {
		if (status === 'authenticated' && session?.user?.id) {
			fetchToken();
		}
		return () => {
			if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
		};
	}, [status, session?.user?.id, fetchToken]);

	const value: SupabaseContextValue = {
		supabase: client!,
		isReady: !!client,
	};

	return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabase(): SupabaseContextValue {
	const ctx = useContext(SupabaseContext);
	if (!ctx) {
		throw new Error('useSupabase must be used within a SupabaseProvider');
	}
	return ctx;
}
