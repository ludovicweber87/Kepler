import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;
const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Mint a custom Supabase JWT containing the user's ID as `sub`.
 * This allows `auth.uid()` to work in RLS policies.
 */
export function mintSupabaseToken(userId: string): { token: string; expiresAt: number } {
	const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
	const token = jwt.sign(
		{
			sub: userId,
			role: 'authenticated',
			aud: 'authenticated',
			iat: Math.floor(Date.now() / 1000),
			exp: expiresAt,
		},
		JWT_SECRET,
	);
	return { token, expiresAt };
}
