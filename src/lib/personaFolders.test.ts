import { describe, it, expect } from 'vitest';
import {
	ALL_FOLDERS,
	resolveActiveFolder,
	filterPersonasByFolder,
	foldersOfPersona,
} from './personaFolders';
import type { Persona, PersonaFolder } from '@/types';

const persona = (id: string, folderIds: string[]) =>
	({
		id,
		name: id,
		role: null,
		system_prompt: null,
		model: null,
		effort: null,
		permission_mode: null,
		color: null,
		created_at: '',
		updated_at: '',
		folder_ids: folderIds,
	}) satisfies Persona;

const folder = (id: string, sortOrder: number) =>
	({
		id,
		name: id,
		color: '#7C5CFF',
		sort_order: sortOrder,
		created_at: '',
	}) satisfies PersonaFolder;

const FRONT = folder('f-front', 0);
const INFRA = folder('f-infra', 1);
const FOLDERS = [FRONT, INFRA];

const REVIEWER = persona('p-reviewer', ['f-front', 'f-infra']);
const DESIGNER = persona('p-designer', ['f-front']);
const ORPHAN = persona('p-orphan', []);
const PERSONAS = [REVIEWER, DESIGNER, ORPHAN];

describe('resolveActiveFolder', () => {
	it('keeps an id that still matches an existing folder', () => {
		expect(resolveActiveFolder('f-infra', FOLDERS)).toBe('f-infra');
	});

	it('falls back to ALL_FOLDERS when the folder is gone', () => {
		expect(resolveActiveFolder('f-deleted', FOLDERS)).toBe(ALL_FOLDERS);
		expect(resolveActiveFolder('f-front', [])).toBe(ALL_FOLDERS);
	});

	it('leaves ALL_FOLDERS untouched', () => {
		expect(resolveActiveFolder(ALL_FOLDERS, FOLDERS)).toBe(ALL_FOLDERS);
	});
});

describe('filterPersonasByFolder', () => {
	it('returns every persona for ALL_FOLDERS', () => {
		expect(filterPersonasByFolder(PERSONAS, ALL_FOLDERS)).toEqual(PERSONAS);
	});

	it('keeps only the personas linked to the folder', () => {
		expect(filterPersonasByFolder(PERSONAS, 'f-front')).toEqual([REVIEWER, DESIGNER]);
		expect(filterPersonasByFolder(PERSONAS, 'f-infra')).toEqual([REVIEWER]);
	});

	it('excludes personas without any folder', () => {
		expect(filterPersonasByFolder(PERSONAS, 'f-front')).not.toContain(ORPHAN);
	});

	it('tolerates a missing folder_ids (persona from a stale cache)', () => {
		const stale = { ...ORPHAN, folder_ids: undefined } as unknown as Persona;
		expect(filterPersonasByFolder([stale], 'f-front')).toEqual([]);
	});
});

describe('foldersOfPersona', () => {
	it('returns the folders in tab order, not in link order', () => {
		const reversed = { ...REVIEWER, folder_ids: ['f-infra', 'f-front'] };
		expect(foldersOfPersona(reversed, FOLDERS)).toEqual([FRONT, INFRA]);
	});

	it('ignores ids that no longer exist', () => {
		const ghost = persona('p-ghost', ['f-gone']);
		expect(foldersOfPersona(ghost, FOLDERS)).toEqual([]);
	});
});
