import type { ProjectV2Item, ProjectV2View, ViewRepoMapping, ViewIssueRef } from '@/types';

export interface FilterPredicate {
	key: string; // lowercased field/qualifier name (e.g. "track", "label", "status")
	value: string;
	negated: boolean; // true for `-field:value`
}

/**
 * Parse a GitHub Project V2 view filter string into predicates.
 * Handles quoted and unquoted values, plus negation:
 *   `track:"Support / TMA"`, `track:Catalogue`, `label:Evolution`, `-priority:P4`
 * Unsupported qualifiers (`has:`, `updated:`, `is:`, date operators…) are still
 * captured here; callers decide which keys they can actually evaluate.
 */
export function parseViewFilter(filter: string): FilterPredicate[] {
	const result: FilterPredicate[] = [];
	if (!filter.trim()) return result;

	// group1: optional negation `-` · group2: key · group3: quoted value · group4: bare value
	const regex = /(-?)(\w+):(?:"([^"]+)"|([^\s,]+))/g;
	let match;
	while ((match = regex.exec(filter)) !== null) {
		const value = match[3] ?? match[4];
		if (value == null) continue;
		result.push({
			key: match[2].toLowerCase(),
			value,
			negated: match[1] === '-',
		});
	}
	return result;
}

/**
 * Check if an item satisfies all evaluable predicates (AND logic).
 * - `label:` → matched against the item's label names
 * - any other key → matched against the project field of the same name
 */
function itemMatchesFilter(item: ProjectV2Item, predicates: FilterPredicate[]): boolean {
	for (const p of predicates) {
		let matches: boolean;
		if (p.key === 'label') {
			matches = (item.labels ?? []).some(
				(l) => l.name.toLowerCase() === p.value.toLowerCase(),
			);
		} else {
			const itemValue = Object.entries(item.fieldValues).find(
				([key]) => key.toLowerCase() === p.key,
			)?.[1];
			matches = !!itemValue && itemValue.toLowerCase() === p.value.toLowerCase();
		}
		const satisfied = p.negated ? !matches : matches;
		if (!satisfied) return false;
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
 * Set of project field names (lowercased) present on the items — the fields we can evaluate.
 */
export function knownFieldsFromItems(items: ProjectV2Item[]): Set<string> {
	const knownFields = new Set<string>();
	for (const item of items) {
		for (const key of Object.keys(item.fieldValues)) knownFields.add(key.toLowerCase());
	}
	return knownFields;
}

/**
 * Return the items matching a view's filter.
 * Only predicates we can evaluate (`label:` or an existing project field) are kept;
 * unknown qualifiers (`has:`, `updated:`, `is:`…) are dropped. No evaluable predicate → all items.
 */
export function matchViewItems(
	view: ProjectV2View,
	items: ProjectV2Item[],
	knownFields: Set<string>,
): ProjectV2Item[] {
	const predicates = parseViewFilter(view.filter).filter(
		(p) => p.key === 'label' || knownFields.has(p.key),
	);
	if (predicates.length === 0) return items;
	return items.filter((item) => itemMatchesFilter(item, predicates));
}

/**
 * Map each view to its matching repos and specific issues based on the view's filter string.
 */
export function mapViewsToRepos(views: ProjectV2View[], items: ProjectV2Item[]): ViewRepoMapping[] {
	const allRepos = uniqueRepos(items);
	const knownFields = knownFieldsFromItems(items);

	return views.map((view) => {
		const matchedItems = matchViewItems(view, items, knownFields);
		const isAll = matchedItems.length === items.length;
		return {
			viewName: view.name,
			repos: isAll ? allRepos : uniqueRepos(matchedItems),
			issues: extractIssueRefs(matchedItems),
		};
	});
}
