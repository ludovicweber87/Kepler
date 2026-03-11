import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

declare module 'next-auth' {
	interface Session {
		accessToken?: string;
		user: {
			id: string;
			login: string;
			name?: string | null;
			email?: string | null;
			image?: string | null;
		};
	}

	interface JWT {
		accessToken?: string;
		login?: string;
	}
}

export const { handlers, signIn, signOut, auth } = NextAuth({
	providers: [
		GitHub({
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
			authorization: {
				params: {
					scope: 'read:user user:email repo read:org read:project',
				},
			},
		}),
	],
	callbacks: {
		async jwt({ token, account, profile }) {
			if (account?.access_token) {
				token.accessToken = account.access_token as string;
			}
			if (profile) {
				token.login = (profile as Record<string, unknown>).login as string | undefined;
				token.picture =
					(profile.image as string | undefined) ??
					((profile as Record<string, unknown>).avatar_url as string | undefined);
			}
			return token;
		},
		async session({ session, token }) {
			session.accessToken = token.accessToken as string | undefined;
			if (token.sub) session.user.id = token.sub;
			if (token.login) session.user.login = token.login as string;
			if (token.picture) session.user.image = token.picture as string;
			return session;
		},
	},
	pages: {
		signIn: '/login',
	},
	session: {
		strategy: 'jwt',
	},
});
