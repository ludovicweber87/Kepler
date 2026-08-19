import type { ProjectV2Config } from '@/types';

export interface OrgProject {
	id: string;
	title: string;
	number: number;
}

export interface OrgWithProjects {
	org: string;
	projects: OrgProject[];
	ownerType: 'organization' | 'user';
}

export interface FlatProject {
	key: string;
	org: string;
	ownerType: 'organization' | 'user';
	project: OrgProject;
	connected: boolean;
}

export function flattenProjects(
	orgProjects: OrgWithProjects[],
	configs: ProjectV2Config[],
): FlatProject[] {
	const connectedKeys = new Set(
		configs.filter((c) => c.connected).map((c) => `${c.org}/${c.projectNumber}`),
	);
	return orgProjects.flatMap((o) =>
		o.projects.map((p) => {
			const key = `${o.org}/${p.number}`;
			return {
				key,
				org: o.org,
				ownerType: o.ownerType,
				project: p,
				connected: connectedKeys.has(key),
			};
		}),
	);
}

export function filterProjects(items: FlatProject[], query: string): FlatProject[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;
	return items.filter(
		(it) =>
			it.project.title.toLowerCase().includes(q) || it.org.toLowerCase().includes(q),
	);
}

export function sortProjectsConnectedFirst(items: FlatProject[]): FlatProject[] {
	return [...items].sort((a, b) => {
		if (a.connected !== b.connected) return a.connected ? -1 : 1;
		return a.project.title.localeCompare(b.project.title);
	});
}

export function countConnected(items: FlatProject[]): number {
	return items.filter((it) => it.connected).length;
}
