'use client';

import { useQuery } from '@tanstack/react-query';
import { getAgentBaseUrl } from '@/lib/local-fetch';

async function pingAgent(): Promise<boolean> {
	try {
		const res = await fetch(`${getAgentBaseUrl()}/health`, {
			signal: AbortSignal.timeout(3000),
		});
		if (!res.ok) return false;
		const data = await res.json();
		return data?.ok === true;
	} catch {
		return false;
	}
}

export function useAgentStatus() {
	const { data: isAgentOnline = false, isLoading: isChecking } = useQuery({
		queryKey: ['agent-status'],
		queryFn: pingAgent,
		refetchInterval: 10_000,
		staleTime: 8_000,
	});

	return { isAgentOnline, isChecking };
}
