'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { setLocalToken } from '@/lib/local-fetch';

function TokenSync() {
	const { data: session } = useSession();

	useEffect(() => {
		setLocalToken(session?.accessToken ?? null);
	}, [session?.accessToken]);

	return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
	return (
		<SessionProvider>
			<TokenSync />
			{children}
		</SessionProvider>
	);
}
