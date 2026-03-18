import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { mintSupabaseToken } from '@/lib/supabase-jwt';

export async function POST() {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { token, expiresAt } = mintSupabaseToken(auth.userId);
	return NextResponse.json({ token, expiresAt });
}
