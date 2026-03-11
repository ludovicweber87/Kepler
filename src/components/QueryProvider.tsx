'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { AuthError } from '@/lib/api-fetch';
import { SnackbarProvider } from '@/hooks/useSnackbar';

function handleAuthError(error: Error) {
	if (error instanceof AuthError) {
		signOut({ callbackUrl: '/login' });
	}
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
	const [client] = useState(
		() =>
			new QueryClient({
				queryCache: new QueryCache({ onError: handleAuthError }),
				mutationCache: new MutationCache({ onError: handleAuthError }),
				defaultOptions: {
					queries: {
						staleTime: 5 * 60 * 1000,
						refetchOnWindowFocus: false,
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={client}>
			<SnackbarProvider>{children}</SnackbarProvider>
		</QueryClientProvider>
	);
}
