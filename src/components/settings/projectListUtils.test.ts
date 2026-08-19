import { describe, it, expect } from 'vitest';
import {
	flattenProjects,
	filterProjects,
	sortProjectsConnectedFirst,
	countConnected,
	type OrgWithProjects,
} from './projectListUtils';
import type { ProjectV2Config } from '@/types';

const orgProjects: OrgWithProjects[] = [
	{
		org: 'acme',
		ownerType: 'organization',
		projects: [
			{ id: 'a', title: 'Roadmap', number: 1 },
			{ id: 'b', title: 'Backlog', number: 2 },
		],
	},
	{
		org: 'me',
		ownerType: 'user',
		projects: [{ id: 'c', title: 'Sprint', number: 5 }],
	},
];

const cfg = (org: string, projectNumber: number, connected: boolean): ProjectV2Config => ({
	org,
	projectNumber,
	projectTitle: '',
	selectedViews: [],
	activeView: null,
	viewOrder: [],
	viewRepoMappings: [],
	statusColumns: [],
	views: [],
	ownerType: 'organization',
	connected,
});

describe('flattenProjects', () => {
	it('flattens org groups and marks connected from configs', () => {
		const flat = flattenProjects(orgProjects, [cfg('acme', 1, true), cfg('me', 5, false)]);
		expect(flat).toHaveLength(3);
		expect(flat.find((f) => f.key === 'acme/1')?.connected).toBe(true);
		expect(flat.find((f) => f.key === 'me/5')?.connected).toBe(false);
		expect(flat.find((f) => f.key === 'acme/2')?.connected).toBe(false);
	});
});

describe('filterProjects', () => {
	const flat = flattenProjects(orgProjects, []);
	it('returns all when query is empty/whitespace', () => {
		expect(filterProjects(flat, '   ')).toHaveLength(3);
	});
	it('matches on title case-insensitively', () => {
		expect(filterProjects(flat, 'road').map((f) => f.key)).toEqual(['acme/1']);
	});
	it('matches on org', () => {
		expect(filterProjects(flat, 'acme').map((f) => f.key).sort()).toEqual(['acme/1', 'acme/2']);
	});
});

describe('sortProjectsConnectedFirst', () => {
	it('puts connected first, then alphabetical by title', () => {
		const flat = flattenProjects(orgProjects, [cfg('acme', 2, true)]);
		const sorted = sortProjectsConnectedFirst(flat);
		expect(sorted[0].key).toBe('acme/2'); // connected
		expect(sorted.slice(1).map((f) => f.project.title)).toEqual(['Roadmap', 'Sprint']);
	});
	it('does not mutate the input array', () => {
		const flat = flattenProjects(orgProjects, []);
		const copy = [...flat];
		sortProjectsConnectedFirst(flat);
		expect(flat).toEqual(copy);
	});
});

describe('countConnected', () => {
	it('counts connected items', () => {
		const flat = flattenProjects(orgProjects, [cfg('acme', 1, true), cfg('me', 5, true)]);
		expect(countConnected(flat)).toBe(2);
	});
});
