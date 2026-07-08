import {
	GitHubRepo,
	GitHubIssue,
	GitHubComment,
	GitHubTimelineEvent,
	GitHubPullRequest,
	CheckRun,
	ProjectColumn,
	ProjectV2Data,
	ProjectV2View,
	ProjectV2Item,
	ViewIssueRef,
} from '@/types';

const GITHUB_API = 'https://api.github.com';

function getToken(token: string): string {
	if (!token) throw new Error('No GitHub token available');
	return token;
}

function getHeaders(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${getToken(token)}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
}

function repoFullName(repositoryUrl: string): string {
	// "https://api.github.com/repos/owner/repo" → "owner/repo"
	return repositoryUrl.replace(`${GITHUB_API}/repos/`, '');
}

export async function fetchUserLogin(token: string): Promise<string> {
	const res = await fetch(`${GITHUB_API}/user`, { headers: getHeaders(token) });
	if (!res.ok) throw new Error(`GitHub /user failed: ${res.status}`);
	const data = await res.json();
	return data.login;
}

export async function fetchUserRepos(token: string): Promise<GitHubRepo[]> {
	const repos: GitHubRepo[] = [];
	let page = 1;

	while (true) {
		const res = await fetch(
			`${GITHUB_API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page=${page}`,
			{ headers: getHeaders(token) },
		);
		if (!res.ok) throw new Error(`GitHub /user/repos failed: ${res.status}`);
		const data: GitHubRepo[] = await res.json();
		if (data.length === 0) break;
		repos.push(...data);
		if (data.length < 100) break;
		page++;
	}

	return repos;
}

async function fetchIssuesByFilter(
	filter: 'assigned' | 'created',
	token: string,
): Promise<GitHubIssue[]> {
	const issues: GitHubIssue[] = [];
	let page = 1;

	while (true) {
		const res = await fetch(
			`${GITHUB_API}/issues?filter=${filter}&state=all&per_page=100&sort=updated&page=${page}`,
			{ headers: getHeaders(token) },
		);
		if (!res.ok) throw new Error(`GitHub /issues (${filter}) failed: ${res.status}`);
		const data: GitHubIssue[] = await res.json();
		if (data.length === 0) break;

		const filtered = data
			.filter((issue) => !issue.pull_request)
			.map((issue) => ({
				...issue,
				repo_full_name: repoFullName(issue.repository_url),
			}));

		issues.push(...filtered);
		if (data.length < 100) break;
		page++;
	}

	return issues;
}

export async function fetchAssignedIssues(token: string): Promise<GitHubIssue[]> {
	return fetchIssuesByFilter('assigned', token);
}

async function fetchProjectColumnsBatch(
	batch: string[],
	token: string,
): Promise<Map<string, ProjectColumn[]>> {
	const result = new Map<string, ProjectColumn[]>();
	const nodeQueries = batch
		.map(
			(id, idx) => `
      n${idx}: node(id: "${id}") {
        ... on Issue {
          id
          projectItems(first: 10) {
            nodes {
              project { title }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }`,
		)
		.join('\n');

	const query = `query { ${nodeQueries} }`;

	try {
		const res = await fetch('https://api.github.com/graphql', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ query }),
		});

		if (!res.ok) return result;

		const json = await res.json();
		if (!json.data) return result;

		for (let idx = 0; idx < batch.length; idx++) {
			const node = json.data[`n${idx}`];
			if (!node?.projectItems?.nodes) continue;

			const columns: ProjectColumn[] = [];
			for (const item of node.projectItems.nodes) {
				const col = item.fieldValueByName?.name;
				if (item.project?.title && col) {
					columns.push({ project: item.project.title, column: col });
				}
			}
			if (columns.length > 0) {
				result.set(batch[idx], columns);
			}
		}
	} catch {
		// GraphQL query failed (missing scope, etc.) — skip silently
	}

	return result;
}

export async function fetchProjectColumns(
	nodeIds: string[],
	token: string,
): Promise<Map<string, ProjectColumn[]>> {
	if (!token || nodeIds.length === 0) return new Map();

	// Split into batches of 50, then run all batches in parallel
	const batches: string[][] = [];
	for (let i = 0; i < nodeIds.length; i += 50) {
		batches.push(nodeIds.slice(i, i + 50));
	}

	const batchResults = await Promise.all(
		batches.map((batch) => fetchProjectColumnsBatch(batch, token)),
	);

	// Merge all batch results into a single map
	const result = new Map<string, ProjectColumn[]>();
	for (const map of batchResults) {
		for (const [key, value] of map) {
			result.set(key, value);
		}
	}
	return result;
}

export async function fetchSpecificIssues(
	refs: ViewIssueRef[],
	token: string,
): Promise<GitHubIssue[]> {
	const results = await Promise.allSettled(
		refs.map((ref) => {
			const [owner, repo] = ref.repo.split('/');
			return fetchIssue(owner, repo, ref.number, token);
		}),
	);
	return results
		.filter((r): r is PromiseFulfilledResult<GitHubIssue> => r.status === 'fulfilled')
		.map((r) => r.value);
}

/**
 * Map a Project V2 item (issue OR pull request) to the GitHubIssue shape the board renders.
 * Everything the board needs comes from the enriched item — no per-issue REST call.
 */
export function projectItemToIssue(item: ProjectV2Item, projectTitle: string): GitHubIssue {
	const status = Object.entries(item.fieldValues).find(
		([key]) => key.toLowerCase() === 'status',
	)?.[1];
	const assignees = item.assignees.map((a) => ({ login: a.login, avatar_url: a.avatarUrl }));
	const isClosed = item.state === 'CLOSED' || item.state === 'MERGED';

	return {
		id: item.number ?? 0,
		node_id: item.nodeId ?? '',
		number: item.number ?? 0,
		title: item.title,
		body: null,
		state: isClosed ? 'closed' : 'open',
		html_url: item.url,
		updated_at: item.updatedAt,
		created_at: item.updatedAt,
		closed_at: null,
		labels: item.labels,
		assignee: assignees[0] ?? null,
		assignees,
		user: assignees[0] ?? { login: '', avatar_url: '' },
		repository_url: item.repoFullName
			? `https://api.github.com/repos/${item.repoFullName}`
			: '',
		pull_request: item.contentType === 'PullRequest' ? {} : undefined,
		repo_full_name: item.repoFullName ?? undefined,
		project_columns: status ? [{ project: projectTitle, column: status }] : [],
	};
}

export async function fetchIssue(
	owner: string,
	repo: string,
	number: number,
	token: string,
): Promise<GitHubIssue> {
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues/${number}`, {
		headers: getHeaders(token),
	});
	if (!res.ok) throw new Error(`GitHub issue fetch failed: ${res.status}`);
	const data: GitHubIssue = await res.json();
	return {
		...data,
		repo_full_name: `${owner}/${repo}`,
	};
}

export async function fetchIssueComments(
	owner: string,
	repo: string,
	number: number,
	token: string,
): Promise<GitHubComment[]> {
	const comments: GitHubComment[] = [];
	let page = 1;

	while (true) {
		const res = await fetch(
			`${GITHUB_API}/repos/${owner}/${repo}/issues/${number}/comments?per_page=100&page=${page}`,
			{ headers: getHeaders(token) },
		);
		if (!res.ok) throw new Error(`GitHub comments fetch failed: ${res.status}`);
		const data: GitHubComment[] = await res.json();
		if (data.length === 0) break;
		comments.push(...data);
		if (data.length < 100) break;
		page++;
	}

	return comments;
}

export async function fetchIssueTimeline(
	owner: string,
	repo: string,
	number: number,
	token: string,
): Promise<GitHubTimelineEvent[]> {
	const events: GitHubTimelineEvent[] = [];
	let page = 1;

	while (true) {
		const res = await fetch(
			`${GITHUB_API}/repos/${owner}/${repo}/issues/${number}/timeline?per_page=100&page=${page}`,
			{
				headers: {
					...getHeaders(token),
					Accept: 'application/vnd.github.mockingbird-preview+json',
				},
			},
		);
		if (!res.ok) throw new Error(`GitHub timeline fetch failed: ${res.status}`);
		const data: GitHubTimelineEvent[] = await res.json();
		if (data.length === 0) break;
		events.push(...data);
		if (data.length < 100) break;
		page++;
	}

	return events;
}

export async function updateIssue(
	owner: string,
	repo: string,
	number: number,
	fields: { title?: string; body?: string },
	token: string,
): Promise<void> {
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues/${number}`, {
		method: 'PATCH',
		headers: { ...getHeaders(token), 'Content-Type': 'application/json' },
		body: JSON.stringify(fields),
	});
	if (!res.ok) throw new Error(`GitHub update issue failed: ${res.status}`);
}

export async function createIssueComment(
	owner: string,
	repo: string,
	number: number,
	body: string,
	token: string,
): Promise<void> {
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues/${number}/comments`, {
		method: 'POST',
		headers: { ...getHeaders(token), 'Content-Type': 'application/json' },
		body: JSON.stringify({ body }),
	});
	if (!res.ok) throw new Error(`GitHub create comment failed: ${res.status}`);
}

export async function updateIssueComment(
	owner: string,
	repo: string,
	commentId: number,
	body: string,
	token: string,
): Promise<void> {
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${commentId}`, {
		method: 'PATCH',
		headers: { ...getHeaders(token), 'Content-Type': 'application/json' },
		body: JSON.stringify({ body }),
	});
	if (!res.ok) throw new Error(`GitHub update comment failed: ${res.status}`);
}

export async function deleteIssueComment(
	owner: string,
	repo: string,
	commentId: number,
	token: string,
): Promise<void> {
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${commentId}`, {
		method: 'DELETE',
		headers: getHeaders(token),
	});
	if (!res.ok) throw new Error(`GitHub delete comment failed: ${res.status}`);
}

export async function createPullRequest(
	owner: string,
	repo: string,
	head: string,
	base: string,
	title: string,
	body: string,
	token: string,
): Promise<{ html_url: string; number: number }> {
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
		method: 'POST',
		headers: { ...getHeaders(token), 'Content-Type': 'application/json' },
		body: JSON.stringify({ head, base, title, body }),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		// If PR already exists for this head, find and return it
		const alreadyExists = err.errors?.some((e: { message?: string }) =>
			e.message?.includes('A pull request already exists'),
		);
		if (alreadyExists) {
			const searchRes = await fetch(
				`${GITHUB_API}/repos/${owner}/${repo}/pulls?head=${owner}:${head}&state=open`,
				{ headers: getHeaders(token) },
			);
			const prs = await searchRes.json();
			if (prs.length > 0) return { html_url: prs[0].html_url, number: prs[0].number };
		}
		const details = err.errors?.map((e: { message?: string }) => e.message).join(', ') ?? '';
		throw new Error(
			err.message + (details ? `: ${details}` : '') ||
				`GitHub create PR failed: ${res.status}`,
		);
	}
	return res.json();
}

// --- Pull Requests ---

export async function fetchRepoPullRequests(
	owner: string,
	repo: string,
	state: 'open' | 'closed' | 'all' = 'open',
	token: string,
): Promise<GitHubPullRequest[]> {
	const prs: GitHubPullRequest[] = [];
	let page = 1;

	while (true) {
		const res = await fetch(
			`${GITHUB_API}/repos/${owner}/${repo}/pulls?state=${state}&per_page=100&sort=updated&direction=desc&page=${page}`,
			{ headers: getHeaders(token) },
		);
		if (!res.ok) throw new Error(`GitHub /pulls failed: ${res.status}`);
		const data = await res.json();
		if (data.length === 0) break;

		// Fetch check runs for all PRs in this page in parallel
		const checksResults = await Promise.all(
			data.map((pr: { head: { sha: string } }) =>
				fetchCheckRunsForRef(owner, repo, pr.head.sha, token),
			),
		);

		for (let i = 0; i < data.length; i++) {
			const pr = data[i];
			const checks = checksResults[i];
			prs.push({
				id: pr.id,
				number: pr.number,
				title: pr.title,
				body: pr.body,
				state: pr.state,
				draft: pr.draft ?? false,
				html_url: pr.html_url,
				created_at: pr.created_at,
				updated_at: pr.updated_at,
				merged_at: pr.merged_at,
				mergeable: pr.mergeable ?? null,
				user: { login: pr.user.login, avatar_url: pr.user.avatar_url },
				head: { ref: pr.head.ref, sha: pr.head.sha, label: pr.head.label },
				base: { ref: pr.base.ref, label: pr.base.label },
				labels: (pr.labels ?? []).map((l: { name: string; color: string }) => ({
					name: l.name,
					color: l.color,
				})),
				requested_reviewers: (pr.requested_reviewers ?? []).map(
					(r: { login: string; avatar_url: string }) => ({
						login: r.login,
						avatar_url: r.avatar_url,
					}),
				),
				review_comments: pr.review_comments ?? 0,
				comments: pr.comments ?? 0,
				additions: pr.additions ?? 0,
				deletions: pr.deletions ?? 0,
				changed_files: pr.changed_files ?? 0,
				repo_full_name: `${owner}/${repo}`,
				check_status: checks.check_status,
				check_runs: checks.check_runs,
			});
		}

		if (data.length < 100) break;
		page++;
	}

	return prs;
}

// --- Check runs ---

async function fetchCheckRunsForRef(
	owner: string,
	repo: string,
	ref: string,
	token: string,
): Promise<{ check_status: GitHubPullRequest['check_status']; check_runs: CheckRun[] }> {
	try {
		const res = await fetch(
			`${GITHUB_API}/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100`,
			{ headers: getHeaders(token) },
		);
		if (!res.ok) return { check_status: null, check_runs: [] };
		const data = await res.json();
		const runs: CheckRun[] = (data.check_runs ?? []).map(
			(r: { name: string; status: string; conclusion: string | null }) => ({
				name: r.name,
				status: r.status,
				conclusion: r.conclusion,
			}),
		);

		let check_status: GitHubPullRequest['check_status'] = null;
		if (runs.length > 0) {
			const hasInProgress = runs.some((r) => r.status !== 'completed');
			const hasFailed = runs.some(
				(r) =>
					r.status === 'completed' &&
					r.conclusion !== 'success' &&
					r.conclusion !== 'neutral' &&
					r.conclusion !== 'skipped',
			);
			if (hasInProgress) check_status = 'pending';
			else if (hasFailed) check_status = 'failure';
			else check_status = 'success';
		}

		return { check_status, check_runs: runs };
	} catch {
		return { check_status: null, check_runs: [] };
	}
}

// --- Merge PR ---

export async function mergePullRequest(
	owner: string,
	repo: string,
	pullNumber: number,
	token: string,
): Promise<{ sha: string; message: string }> {
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, {
		method: 'PUT',
		headers: { ...getHeaders(token), 'Content-Type': 'application/json' },
		body: JSON.stringify({ merge_method: 'squash' }),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || `Merge failed: ${res.status}`);
	}
	return res.json();
}

// --- Project V2 GraphQL functions ---

function graphqlHeaders(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${getToken(token)}`,
		'Content-Type': 'application/json',
	};
}

async function graphqlRequest(
	query: string,
	variables: Record<string, unknown> = {},
	token: string,
) {
	const res = await fetch('https://api.github.com/graphql', {
		method: 'POST',
		headers: graphqlHeaders(token),
		body: JSON.stringify({ query, variables }),
	});
	if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
	const json = await res.json();
	if (json.errors?.length) throw new Error(json.errors[0].message);
	return json.data;
}

export async function fetchOrgProjects(
	org: string,
	token: string,
): Promise<{ id: string; title: string; number: number }[]> {
	const query = `
    query($org: String!) {
      organization(login: $org) {
        projectsV2(first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) {
          nodes { id title number }
        }
      }
    }
  `;
	const data = await graphqlRequest(query, { org }, token);
	return data.organization.projectsV2.nodes;
}

export interface OrgWithProjects {
	org: string;
	projects: { id: string; title: string; number: number }[];
	ownerType: 'organization' | 'user';
}

export async function fetchViewerOrgProjects(token: string): Promise<OrgWithProjects[]> {
	const query = `
    query {
      viewer {
        login
        projectsV2(first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) {
          nodes { id title number }
        }
        organizations(first: 50) {
          nodes {
            login
            projectsV2(first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) {
              nodes { id title number }
            }
          }
        }
      }
    }
  `;
	const data = await graphqlRequest(query, {}, token);
	const viewer = data.viewer as {
		login: string;
		projectsV2: { nodes: { id: string; title: string; number: number }[] };
		organizations: {
			nodes: {
				login: string;
				projectsV2: { nodes: { id: string; title: string; number: number }[] };
			}[];
		};
	};

	const result: OrgWithProjects[] = [];

	// Personal projects
	if (viewer.projectsV2.nodes.length > 0) {
		result.push({
			org: viewer.login,
			projects: viewer.projectsV2.nodes,
			ownerType: 'user',
		});
	}

	// Organization projects
	for (const o of viewer.organizations.nodes) {
		if (o.projectsV2.nodes.length > 0) {
			result.push({
				org: o.login,
				projects: o.projectsV2.nodes,
				ownerType: 'organization',
			});
		}
	}

	return result;
}

// --- Status mutation helpers ---

export interface StatusFieldInfo {
	projectId: string;
	fieldId: string;
	options: { id: string; name: string }[];
}

export async function fetchStatusFieldInfo(
	org: string,
	projectNumber: number,
	token: string,
	ownerType: 'organization' | 'user' = 'organization',
): Promise<StatusFieldInfo> {
	async function tryFetch(type: 'organization' | 'user') {
		const query = `
      query($org: String!, $num: Int!) {
        ${type}(login: $org) {
          projectV2(number: $num) {
            id
            field(name: "Status") {
              ... on ProjectV2SingleSelectField {
                id
                options { id name }
              }
            }
          }
        }
      }
    `;
		const data = await graphqlRequest(query, { org, num: projectNumber }, token);
		const project = data[type].projectV2;
		return {
			projectId: project.id,
			fieldId: project.field.id,
			options: project.field.options,
		};
	}

	try {
		return await tryFetch(ownerType);
	} catch {
		// Fallback: try the other type
		return await tryFetch(ownerType === 'organization' ? 'user' : 'organization');
	}
}

export async function findProjectItemId(
	issueNodeId: string,
	projectId: string,
	token: string,
): Promise<string> {
	const query = `
    query($id: ID!) {
      node(id: $id) {
        ... on Issue {
          projectItems(first: 20) {
            nodes {
              id
              project { id }
            }
          }
        }
      }
    }
  `;
	const data = await graphqlRequest(query, { id: issueNodeId }, token);
	const items = data.node?.projectItems?.nodes ?? [];
	const match = items.find(
		(item: { id: string; project: { id: string } }) => item.project.id === projectId,
	);
	if (!match) throw new Error('Issue not found in project');
	return match.id;
}

export async function updateProjectItemStatus(
	projectId: string,
	itemId: string,
	fieldId: string,
	optionId: string,
	token: string,
): Promise<void> {
	const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }
      ) {
        projectV2Item { id }
      }
    }
  `;
	await graphqlRequest(mutation, { projectId, itemId, fieldId, optionId }, token);
}

// --- Project V2 data fetching ---

export async function fetchProjectV2Data(
	org: string,
	projectNumber: number,
	token: string,
	ownerType: 'organization' | 'user' = 'organization',
): Promise<ProjectV2Data> {
	const ownerField = ownerType === 'user' ? 'user' : 'organization';
	// First fetch project info + views + first page of items in a single query
	const combinedQuery = `
    query($org: String!, $num: Int!) {
      ${ownerField}(login: $org) {
        projectV2(number: $num) {
          id
          title
          number
          views(first: 50) {
            nodes { id name filter }
          }
          field(name: "Status") {
            ... on ProjectV2SingleSelectField {
              options { name }
            }
          }
          items(first: 100) {
            nodes {
              content {
                __typename
                ... on Issue { id number title url state updatedAt repository { nameWithOwner } assignees(first: 10) { nodes { login avatarUrl } } labels(first: 20) { nodes { name color } } }
                ... on PullRequest { id number title url state updatedAt repository { nameWithOwner } assignees(first: 10) { nodes { login avatarUrl } } labels(first: 20) { nodes { name color } } }
              }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    field { ... on ProjectV2SingleSelectField { name } }
                    name
                  }
                  ... on ProjectV2ItemFieldTextValue {
                    field { ... on ProjectV2Field { name } }
                    text
                  }
                  ... on ProjectV2ItemFieldIterationValue {
                    field { ... on ProjectV2IterationField { name } }
                    title
                  }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  `;
	const initialData = await graphqlRequest(combinedQuery, { org, num: projectNumber }, token);
	const project = initialData[ownerField].projectV2;

	const views: ProjectV2View[] = project.views.nodes.map(
		(v: { id: string; name: string; filter: string | null }) => ({
			id: v.id,
			name: v.name,
			filter: v.filter ?? '',
		}),
	);

	const statusColumns: string[] = (project.field?.options ?? []).map(
		(o: { name: string }) => o.name,
	);

	// Parse items from response pages
	function parseItemNodes(nodes: Record<string, unknown>[]): ProjectV2Item[] {
		return nodes.map((node) => {
			const content = node.content as Record<string, unknown> | null;
			const contentType = ((content?.__typename as string) ??
				'DraftIssue') as ProjectV2Item['contentType'];
			const repo = content?.repository as { nameWithOwner: string } | null;
			const repoFullName = repo?.nameWithOwner ?? null;
			const number = (content?.number as number) ?? null;

			const labelNodes = (
				content?.labels as { nodes?: { name: string; color: string }[] } | undefined
			)?.nodes;
			const labels = (labelNodes ?? [])
				.filter((l) => l.name)
				.map((l) => ({ name: l.name, color: l.color ?? '888888' }));

			const assigneeNodes = (
				content?.assignees as { nodes?: { login: string; avatarUrl: string }[] } | undefined
			)?.nodes;
			const assignees = (assigneeNodes ?? []).map((a) => ({
				login: a.login,
				avatarUrl: a.avatarUrl,
			}));

			const nodeId = (content?.id as string) ?? null;
			const title = (content?.title as string) ?? '';
			const url = (content?.url as string) ?? '';
			const state = (content?.state as string) ?? '';
			const updatedAt = (content?.updatedAt as string) ?? '';

			const fieldValues: Record<string, string> = {};
			const fvNodes = (node.fieldValues as { nodes: Record<string, unknown>[] }).nodes;
			for (const fv of fvNodes) {
				const field = fv?.field as { name?: string } | null;
				const fieldName = field?.name;
				const value = (fv?.name ?? fv?.text ?? fv?.title) as string | undefined;
				if (fieldName && value) {
					fieldValues[fieldName] = value;
				}
			}

			return {
				contentType,
				repoFullName,
				number,
				fieldValues,
				labels,
				nodeId,
				title,
				url,
				state,
				updatedAt,
				assignees,
			};
		});
	}

	// First page already fetched
	const items: ProjectV2Item[] = parseItemNodes(project.items.nodes);
	let hasNext = project.items.pageInfo.hasNextPage;
	let cursor: string | null = project.items.pageInfo.endCursor;

	// Paginate remaining items sequentially (cursor-based, can't parallelize)
	while (hasNext) {
		const itemsQuery = `
      query($org: String!, $num: Int!, $cursor: String) {
        ${ownerField}(login: $org) {
          projectV2(number: $num) {
            items(first: 100, after: $cursor) {
              nodes {
                content {
                  __typename
                  ... on Issue { id number title url state updatedAt repository { nameWithOwner } assignees(first: 10) { nodes { login avatarUrl } } labels(first: 20) { nodes { name color } } }
                  ... on PullRequest { id number title url state updatedAt repository { nameWithOwner } assignees(first: 10) { nodes { login avatarUrl } } labels(first: 20) { nodes { name color } } }
                }
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      field { ... on ProjectV2SingleSelectField { name } }
                      name
                    }
                    ... on ProjectV2ItemFieldTextValue {
                      field { ... on ProjectV2Field { name } }
                      text
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      field { ... on ProjectV2IterationField { name } }
                      title
                    }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }
    `;
		const data = await graphqlRequest(itemsQuery, { org, num: projectNumber, cursor }, token);
		const itemsPage = data[ownerField].projectV2.items;
		items.push(...parseItemNodes(itemsPage.nodes));
		hasNext = itemsPage.pageInfo.hasNextPage;
		cursor = itemsPage.pageInfo.endCursor;
	}

	return {
		id: project.id,
		title: project.title,
		number: project.number,
		views,
		items,
		statusColumns,
	};
}
