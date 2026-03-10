import { useQuery } from '@tanstack/react-query';
import {
	DashboardData,
	GitHubIssue,
	GitHubComment,
	GitHubTimelineEvent,
	ViewIssueRef,
} from '@/types';

async function fetchDashboardAll(): Promise<DashboardData> {
	const res = await fetch('/api/github');
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	if (data.error) throw new Error(data.error);
	return data;
}

interface IssueWithComments {
	issue: GitHubIssue;
	comments: GitHubComment[];
}

async function fetchIssue(owner: string, repo: string, number: string): Promise<IssueWithComments> {
	const res = await fetch(`/api/github/issue?owner=${owner}&repo=${repo}&number=${number}`);
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	if (data.error) throw new Error(data.error);
	return data;
}

export function useDashboard(issueRefs?: ViewIssueRef[], options?: { enabled?: boolean }) {
	// Always use the "all" query key so the cache is shared across pages.
	// When issueRefs are provided, we still fetch "all" and filter client-side
	// in the consuming component.
	return useQuery({
		queryKey: ['github', 'dashboard', 'all'],
		queryFn: fetchDashboardAll,
		enabled: options?.enabled,
	});
}

export function useIssue(owner: string, repo: string, number: string) {
	return useQuery({
		queryKey: ['github', 'issue', owner, repo, number],
		queryFn: () => fetchIssue(owner, repo, number),
		refetchOnMount: 'always',
	});
}

async function fetchIssueTimeline(
	owner: string,
	repo: string,
	number: string,
): Promise<GitHubTimelineEvent[]> {
	const res = await fetch(
		`/api/github/issue/timeline?owner=${owner}&repo=${repo}&number=${number}`,
	);
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	if (data.error) throw new Error(data.error);
	return data.events;
}

export function useIssueTimeline(owner: string, repo: string, number: string) {
	return useQuery({
		queryKey: ['github', 'issue-timeline', owner, repo, number],
		queryFn: () => fetchIssueTimeline(owner, repo, number),
		enabled: false,
	});
}
