import type { ProjectV2Item, ProjectV2View, ViewRepoMapping, ViewIssueRef } from "@/types";

/**
 * Parse a GitHub Project V2 view filter string into field:value pairs.
 * Filter format examples: `status:"In Progress"`, `track:"Softr Migration"`, `status:"Done",label:"bug"`
 */
export function parseViewFilter(filter: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!filter.trim()) return result;

  const regex = /(\w+):"([^"]+)"/g;
  let match;
  while ((match = regex.exec(filter)) !== null) {
    result[match[1].toLowerCase()] = match[2];
  }
  return result;
}

/**
 * Check if an item matches a parsed filter (AND logic: all filter fields must match).
 */
function itemMatchesFilter(item: ProjectV2Item, filterFields: Record<string, string>): boolean {
  for (const [filterKey, filterValue] of Object.entries(filterFields)) {
    const itemValue = Object.entries(item.fieldValues).find(
      ([key]) => key.toLowerCase() === filterKey
    )?.[1];
    if (!itemValue || itemValue.toLowerCase() !== filterValue.toLowerCase()) {
      return false;
    }
  }
  return true;
}

/**
 * Get unique repo full names from a list of items.
 */
function uniqueRepos(items: ProjectV2Item[]): string[] {
  const repos = new Set<string>();
  for (const item of items) {
    if (item.repoFullName) repos.add(item.repoFullName);
  }
  return Array.from(repos).sort();
}

function extractIssueRefs(items: ProjectV2Item[]): ViewIssueRef[] {
  return items
    .filter((i) => i.repoFullName && i.number != null)
    .map((i) => ({ repo: i.repoFullName!, number: i.number! }));
}

/**
 * Map each view to its matching repos and specific issues based on the view's filter string.
 * Empty/unparseable filters → all items (safe default).
 */
export function mapViewsToRepos(views: ProjectV2View[], items: ProjectV2Item[]): ViewRepoMapping[] {
  const allRepos = uniqueRepos(items);

  return views.map((view) => {
    const filterFields = parseViewFilter(view.filter);

    if (Object.keys(filterFields).length === 0) {
      return { viewName: view.name, repos: allRepos, issues: extractIssueRefs(items) };
    }

    const matchedItems = items.filter((item) => itemMatchesFilter(item, filterFields));
    return { viewName: view.name, repos: uniqueRepos(matchedItems), issues: extractIssueRefs(matchedItems) };
  });
}
