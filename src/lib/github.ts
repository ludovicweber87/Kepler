import { GitHubRepo, GitHubIssue, GitHubComment, GitHubTimelineEvent, GitHubPullRequest, ProjectColumn, ProjectV2Data, ProjectV2View, ProjectV2Item, ViewIssueRef } from "@/types";

const GITHUB_API = "https://api.github.com";

function getHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function repoFullName(repositoryUrl: string): string {
  // "https://api.github.com/repos/owner/repo" → "owner/repo"
  return repositoryUrl.replace(`${GITHUB_API}/repos/`, "");
}

export async function fetchUserLogin(): Promise<string> {
  const res = await fetch(`${GITHUB_API}/user`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`GitHub /user failed: ${res.status}`);
  const data = await res.json();
  return data.login;
}

export async function fetchUserRepos(): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${GITHUB_API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page=${page}`,
      { headers: getHeaders() }
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

export async function fetchAssignedIssues(): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${GITHUB_API}/issues?filter=assigned&state=all&per_page=100&sort=updated&page=${page}`,
      { headers: getHeaders() }
    );
    if (!res.ok) throw new Error(`GitHub /issues failed: ${res.status}`);
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

export async function fetchProjectColumns(
  nodeIds: string[]
): Promise<Map<string, ProjectColumn[]>> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return new Map();

  const result = new Map<string, ProjectColumn[]>();
  // Batch in groups of 50 to stay within GraphQL limits
  for (let i = 0; i < nodeIds.length; i += 50) {
    const batch = nodeIds.slice(i, i + 50);
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
      }`
      )
      .join("\n");

    const query = `query { ${nodeQueries} }`;

    try {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) continue;

      const json = await res.json();
      if (!json.data) continue;

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
  }

  return result;
}

export async function fetchSpecificIssues(refs: ViewIssueRef[]): Promise<GitHubIssue[]> {
  const results = await Promise.allSettled(
    refs.map((ref) => {
      const [owner, repo] = ref.repo.split("/");
      return fetchIssue(owner, repo, ref.number);
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<GitHubIssue> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function fetchIssue(
  owner: string,
  repo: string,
  number: number
): Promise<GitHubIssue> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/${number}`,
    { headers: getHeaders() }
  );
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
  number: number
): Promise<GitHubComment[]> {
  const comments: GitHubComment[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${number}/comments?per_page=100&page=${page}`,
      { headers: getHeaders() }
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
  number: number
): Promise<GitHubTimelineEvent[]> {
  const events: GitHubTimelineEvent[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${number}/timeline?per_page=100&page=${page}`,
      {
        headers: {
          ...getHeaders(),
          Accept: "application/vnd.github.mockingbird-preview+json",
        },
      }
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

export async function createIssueComment(
  owner: string,
  repo: string,
  number: number,
  body: string
): Promise<void> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/${number}/comments`,
    {
      method: "POST",
      headers: { ...getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }
  );
  if (!res.ok) throw new Error(`GitHub create comment failed: ${res.status}`);
}

// --- Pull Requests ---

export async function fetchRepoPullRequests(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open"
): Promise<GitHubPullRequest[]> {
  const prs: GitHubPullRequest[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=${state}&per_page=100&sort=updated&direction=desc&page=${page}`,
      { headers: getHeaders() }
    );
    if (!res.ok) throw new Error(`GitHub /pulls failed: ${res.status}`);
    const data = await res.json();
    if (data.length === 0) break;

    for (const pr of data) {
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
        user: { login: pr.user.login, avatar_url: pr.user.avatar_url },
        head: { ref: pr.head.ref, label: pr.head.label },
        base: { ref: pr.base.ref, label: pr.base.label },
        labels: (pr.labels ?? []).map((l: { name: string; color: string }) => ({
          name: l.name,
          color: l.color,
        })),
        requested_reviewers: (pr.requested_reviewers ?? []).map(
          (r: { login: string; avatar_url: string }) => ({
            login: r.login,
            avatar_url: r.avatar_url,
          })
        ),
        review_comments: pr.review_comments ?? 0,
        comments: pr.comments ?? 0,
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        changed_files: pr.changed_files ?? 0,
        repo_full_name: `${owner}/${repo}`,
      });
    }

    if (data.length < 100) break;
    page++;
  }

  return prs;
}

// --- Project V2 GraphQL functions ---

function graphqlHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function graphqlRequest(query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: graphqlHeaders(),
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export async function fetchOrgProjects(org: string): Promise<{ id: string; title: string; number: number }[]> {
  const query = `
    query($org: String!) {
      organization(login: $org) {
        projectsV2(first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) {
          nodes { id title number }
        }
      }
    }
  `;
  const data = await graphqlRequest(query, { org });
  return data.organization.projectsV2.nodes;
}

export interface OrgWithProjects {
  org: string;
  projects: { id: string; title: string; number: number }[];
}

export async function fetchViewerOrgProjects(): Promise<OrgWithProjects[]> {
  const query = `
    query {
      viewer {
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
  const data = await graphqlRequest(query);
  const orgs = data.viewer.organizations.nodes as {
    login: string;
    projectsV2: { nodes: { id: string; title: string; number: number }[] };
  }[];
  return orgs
    .filter((o) => o.projectsV2.nodes.length > 0)
    .map((o) => ({ org: o.login, projects: o.projectsV2.nodes }));
}

// --- Status mutation helpers ---

export interface StatusFieldInfo {
  projectId: string;
  fieldId: string;
  options: { id: string; name: string }[];
}

export async function fetchStatusFieldInfo(org: string, projectNumber: number): Promise<StatusFieldInfo> {
  const query = `
    query($org: String!, $num: Int!) {
      organization(login: $org) {
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
  const data = await graphqlRequest(query, { org, num: projectNumber });
  const project = data.organization.projectV2;
  return {
    projectId: project.id,
    fieldId: project.field.id,
    options: project.field.options,
  };
}

export async function findProjectItemId(issueNodeId: string, projectId: string): Promise<string> {
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
  const data = await graphqlRequest(query, { id: issueNodeId });
  const items = data.node?.projectItems?.nodes ?? [];
  const match = items.find((item: { id: string; project: { id: string } }) => item.project.id === projectId);
  if (!match) throw new Error("Issue not found in project");
  return match.id;
}

export async function updateProjectItemStatus(
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string
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
  await graphqlRequest(mutation, { projectId, itemId, fieldId, optionId });
}

// --- Project V2 data fetching ---

export async function fetchProjectV2Data(org: string, projectNumber: number): Promise<ProjectV2Data> {
  // First fetch project info + views
  const infoQuery = `
    query($org: String!, $num: Int!) {
      organization(login: $org) {
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
        }
      }
    }
  `;
  const infoData = await graphqlRequest(infoQuery, { org, num: projectNumber });
  const project = infoData.organization.projectV2;

  const views: ProjectV2View[] = project.views.nodes.map((v: { id: string; name: string; filter: string | null }) => ({
    id: v.id,
    name: v.name,
    filter: v.filter ?? "",
  }));

  const statusColumns: string[] = (project.field?.options ?? []).map((o: { name: string }) => o.name);

  // Paginate items
  const items: ProjectV2Item[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const itemsQuery = `
      query($org: String!, $num: Int!, $cursor: String) {
        organization(login: $org) {
          projectV2(number: $num) {
            items(first: 100, after: $cursor) {
              nodes {
                content {
                  __typename
                  ... on Issue { number repository { nameWithOwner } }
                  ... on PullRequest { number repository { nameWithOwner } }
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
    const data = await graphqlRequest(itemsQuery, { org, num: projectNumber, cursor });
    const itemsPage = data.organization.projectV2.items;

    for (const node of itemsPage.nodes) {
      const content = node.content;
      const contentType = content?.__typename ?? "DraftIssue";
      const repoFullName = content?.repository?.nameWithOwner ?? null;
      const number = content?.number ?? null;

      const fieldValues: Record<string, string> = {};
      for (const fv of node.fieldValues.nodes) {
        const fieldName = fv?.field?.name;
        const value = fv?.name ?? fv?.text ?? fv?.title;
        if (fieldName && value) {
          fieldValues[fieldName] = value;
        }
      }

      items.push({ contentType, repoFullName, number, fieldValues });
    }

    hasNext = itemsPage.pageInfo.hasNextPage;
    cursor = itemsPage.pageInfo.endCursor;
  }

  return { id: project.id, title: project.title, number: project.number, views, items, statusColumns };
}
