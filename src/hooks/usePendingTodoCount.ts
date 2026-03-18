import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useSupabase } from '@/hooks/useSupabase';

export function usePendingTodoCount() {
	const { data: session } = useSession();
	const userId = session?.user?.id ?? null;
	const { supabase, isReady } = useSupabase();

	const { data: count = 0 } = useQuery({
		queryKey: ['todos', 'pending-count'],
		queryFn: async () => {
			const { count, error } = await supabase
				.from('todos')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId!)
				.eq('done', false);

			if (error) throw error;
			return count ?? 0;
		},
		enabled: !!userId && isReady,
		refetchInterval: 30_000,
	});

	return count;
}
