import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ClaudeDayActivity {
	day: string;
	date: string;
	sessions: number;
	completed: number;
	errors: number;
	reports: number;
}

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

async function fetchClaudeActivity(): Promise<ClaudeDayActivity[]> {
	const now = new Date();
	const weekAgo = new Date(now);
	weekAgo.setDate(weekAgo.getDate() - 6);
	weekAgo.setHours(0, 0, 0, 0);

	const { data, error } = await supabase
		.from('agent_sessions')
		.select('started_at, status, report_published_at')
		.gte('started_at', weekAgo.toISOString());

	if (error) throw error;

	const days: ClaudeDayActivity[] = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(weekAgo);
		d.setDate(d.getDate() + i);
		const dateStr = d.toISOString().slice(0, 10);
		days.push({
			day: DAY_LABELS[d.getDay()],
			date: dateStr,
			sessions: 0,
			completed: 0,
			errors: 0,
			reports: 0,
		});
	}

	for (const s of data ?? []) {
		const dateStr = s.started_at.slice(0, 10);
		const entry = days.find((d) => d.date === dateStr);
		if (!entry) continue;
		entry.sessions++;
		if (s.status === 'completed') entry.completed++;
		if (s.status === 'error') entry.errors++;
		if (s.report_published_at) entry.reports++;
	}

	return days;
}

export function useClaudeActivity() {
	return useQuery({
		queryKey: ['claude-activity'],
		queryFn: fetchClaudeActivity,
		refetchInterval: 60_000,
	});
}
