import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getEnv() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !anonKey) {
		throw new Error(
			'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables',
		);
	}
	return { url, anonKey };
}

/** Create an authenticated Supabase client using a custom JWT */
export function createSupabaseClient(token: string): SupabaseClient {
	const { url, anonKey } = getEnv();
	return createClient(url, anonKey, {
		global: {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		},
	});
}

/** Server-only: service role client that bypasses RLS */
export function createServiceRoleClient(): SupabaseClient {
	const { url } = getEnv();
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) {
		throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
	}
	return createClient(url, serviceRoleKey);
}
