import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Default anon client — used as fallback only */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Create an authenticated Supabase client using a custom JWT */
export function createSupabaseClient(token: string): SupabaseClient {
	return createClient(supabaseUrl, supabaseAnonKey, {
		global: {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		},
	});
}

/** Server-only: service role client that bypasses RLS */
export function createServiceRoleClient(): SupabaseClient {
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
	return createClient(supabaseUrl, serviceRoleKey);
}
