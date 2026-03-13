import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface DevServer {
	pid: number;
	port: number;
	cwd: string;
	branch: string | null;
	startedAt: number;
}

export function useDevServers() {
	const queryClient = useQueryClient();

	const { data: servers = [] } = useQuery({
		queryKey: ['dev-servers'],
		queryFn: async () => {
			const res = await fetch('/api/dev-servers');
			if (!res.ok) throw new Error('Failed to fetch dev servers');
			const json = (await res.json()) as { servers: DevServer[] };
			return json.servers;
		},
		refetchInterval: 5000,
	});

	const startMutation = useMutation({
		mutationFn: async ({ cwd, branch }: { cwd: string; branch?: string }) => {
			const res = await fetch('/api/dev-servers', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cwd, branch }),
			});
			if (!res.ok) throw new Error('Failed to start dev server');
			const json = (await res.json()) as { server: DevServer };
			return json.server;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['dev-servers'] });
		},
	});

	const stopMutation = useMutation({
		mutationFn: async (pid: number) => {
			const res = await fetch('/api/dev-servers', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pid }),
			});
			if (!res.ok) throw new Error('Failed to stop dev server');
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['dev-servers'] });
		},
	});

	return {
		servers,
		startServer: startMutation.mutateAsync,
		isStarting: startMutation.isPending,
		stopServer: stopMutation.mutateAsync,
		isStopping: stopMutation.isPending,
		/** Find a running dev server for a given worktree path */
		getServerForPath: (cwd: string) => servers.find((s) => s.cwd === cwd) ?? null,
	};
}
