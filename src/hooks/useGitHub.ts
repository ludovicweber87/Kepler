import { useQuery } from '@tanstack/react-query';
import {
	DashboardData,
	GitHubIssue,
	GitHubComment,
	GitHubTimelineEvent,
	ViewIssueRef,
} from '@/types';
import { apiFetch } from '@/lib/api-fetch';

async function fetchDashboardAll(): Promise<DashboardData> {
	const res = await apiFetch('/api/github');
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	if (data.error) throw new Error(data.error);
	return data;
}

async function fetchDashboardByRefs(refs: ViewIssueRef[]): Promise<DashboardData> {
	const res = await apiFetch('/api/github', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ issues: refs }),
	});
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
	const res = await apiFetch(`/api/github/issue?owner=${owner}&repo=${repo}&number=${number}`);
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	const data = await res.json();
	if (data.error) throw new Error(data.error);
	return data;
}

export function useDashboard(issueRefs?: ViewIssueRef[], options?: { enabled?: boolean }) {
	const hasRefs = issueRefs && issueRefs.length > 0;
	return useQuery({
		queryKey: hasRefs
			? ['github', 'dashboard', 'project', issueRefs]
			: ['github', 'dashboard', 'all'],
		queryFn: hasRefs ? () => fetchDashboardByRefs(issueRefs) : fetchDashboardAll,
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
	const res = await apiFetch(
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
